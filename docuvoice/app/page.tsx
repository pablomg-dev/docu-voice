'use client'

import { useState, useCallback } from 'react'
import InputScreen from '@/components/InputScreen'
import ProgressIndicator from '@/components/ProgressIndicator'
import PlayerScreen from '@/components/PlayerScreen'
import DemoMode from '@/components/DemoMode'
import type { Section } from '@/types'
import type { VoiceMode } from '@/lib/voiceMap'

type AppState =
  | { screen: 'input' }
  | { screen: 'progress'; requestBody: { url?: string; text?: string; backgroundMusic: boolean; voiceMode: VoiceMode } }
  | { screen: 'player'; sessionId: string; sections: Array<Section & { startTimestamp: number; endTimestamp: number }>; title: string }
  | { screen: 'demo' }

export default function Home() {
  const [state, setState] = useState<AppState>({ screen: 'input' })

  const handleSubmit = useCallback(
    (input: { url?: string; text?: string; backgroundMusic: boolean; voiceMode: VoiceMode }) => {
      setState({ screen: 'progress', requestBody: input })
    },
    []
  )

  const handleLoadDemo = useCallback(() => {
    setState({ screen: 'demo' })
  }, [])

  const handleProcessingComplete = useCallback(
    async (sessionId: string) => {
      // Fetch the timeline metadata from the session
      // We derive sections from the SSE stream — for now we fetch the voices
      // endpoint to confirm the server is up, then transition to player.
      // The actual section data is embedded in the session store on the server;
      // we pass the sessionId and let PlayerScreen stream audio directly.
      //
      // To get section metadata for the sidebar, we add a lightweight
      // /api/session/[id] endpoint — but for MVP we store it in state
      // via a custom event. Here we use a simpler approach: re-fetch
      // the session metadata via a dedicated endpoint.
      try {
        const res = await fetch(`/api/session/${sessionId}`)
        if (res.ok) {
          const data = await res.json()
          setState({
            screen: 'player',
            sessionId,
            sections: data.sections,
            title: data.title,
          })
        } else {
          // Fallback: show player with empty sections (audio still works)
          setState({
            screen: 'player',
            sessionId,
            sections: [],
            title: 'DocuVoice Audio',
          })
        }
      } catch {
        setState({
          screen: 'player',
          sessionId,
          sections: [],
          title: 'DocuVoice Audio',
        })
      }
    },
    []
  )

  const handleBack = useCallback(() => {
    setState({ screen: 'input' })
  }, [])

  if (state.screen === 'demo') {
    return <DemoMode onExit={handleBack} />
  }

  if (state.screen === 'progress') {
    return (
      <ProgressIndicator
        requestBody={state.requestBody}
        onComplete={handleProcessingComplete}
        onRetry={handleBack}
      />
    )
  }

  if (state.screen === 'player') {
    return (
      <PlayerScreen
        sessionId={state.sessionId}
        sections={state.sections}
        title={state.title}
        onBack={handleBack}
      />
    )
  }

  return (
    <InputScreen
      onSubmit={handleSubmit}
      onLoadDemo={handleLoadDemo}
    />
  )
}

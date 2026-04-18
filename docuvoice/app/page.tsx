'use client'

import { useState, useCallback } from 'react'
import InputScreen from '@/components/InputScreen'
import ProgressIndicator from '@/components/ProgressIndicator'
import PlayerScreen from '@/components/PlayerScreen'
import type { Section } from '@/types'
import type { VoiceMode } from '@/lib/voiceMap'

type AppState =
  | { screen: 'input' }
  | { screen: 'progress'; requestBody: { url?: string; text?: string; backgroundMusic: boolean; voiceMode: VoiceMode } }
  | { screen: 'player'; sessionId: string; sections: Array<Section & { startTimestamp: number; endTimestamp: number }>; title: string }

export default function Home() {
  const [state, setState] = useState<AppState>({ screen: 'input' })

  const handleSubmit = useCallback(
    (input: { url?: string; text?: string; backgroundMusic: boolean; voiceMode: VoiceMode }) => {
      setState({ screen: 'progress', requestBody: input })
    },
    []
  )

  const handleProcessingComplete = useCallback(
    async (sessionId: string) => {
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
    />
  )
}

'use client'

import { DEMO_SECTIONS, DEMO_TITLE, DEMO_SESSION_ID } from '@/lib/demo/demoContent'
import PlayerScreen from '@/components/PlayerScreen'

interface DemoModeProps {
  onExit: () => void
}

/**
 * DemoMode loads pre-bundled audio from /public/demo/ and renders the
 * PlayerScreen directly — no API calls are made.
 */
export default function DemoMode({ onExit }: DemoModeProps) {
  return (
    <PlayerScreen
      sessionId={DEMO_SESSION_ID}
      sections={DEMO_SECTIONS}
      title={DEMO_TITLE}
      isDemo={true}
      onBack={onExit}
    />
  )
}

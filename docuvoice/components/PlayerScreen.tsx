'use client'

import { useCallback, useRef, useState } from 'react'
import AudioPlayer from '@/components/AudioPlayer'
import type { AudioPlayerHandle } from '@/components/AudioPlayer'
import SectionSidebar from '@/components/SectionSidebar'
import ExportButtons from '@/components/ExportButtons'
import type { Section } from '@/types'

interface PlayerScreenProps {
  sessionId: string
  sections: Array<Section & { startTimestamp: number; endTimestamp: number }>
  title: string
  onBack: () => void
}

export default function PlayerScreen({
  sessionId,
  sections,
  title,
  onBack,
}: PlayerScreenProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const playerRef = useRef<AudioPlayerHandle>(null)

  const audioUrl = `/api/download/${sessionId}`

  const handleTimeUpdate = useCallback((_ms: number) => {
    // time is handled inside AudioPlayer for section sync
  }, [])

  const handleSectionChange = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  // Called when user clicks play button on a sidebar section
  const handleSeek = useCallback((timestampMs: number, index: number) => {
    playerRef.current?.seekTo(timestampMs)
    playerRef.current?.play()
    setActiveIndex(index)
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <button
          onClick={onBack}
          className="min-h-[44px] min-w-[44px] cursor-pointer rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Back to input"
        >
          ← Back
        </button>

        <h1 className="truncate text-sm font-semibold text-white">
          {title}
        </h1>

        <ExportButtons sessionId={sessionId} title={title} />
      </header>

      {/* Main layout */}
      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row">
        {/* Player */}
        <div className="md:w-80 md:shrink-0">
          <AudioPlayer
            ref={playerRef}
            audioUrl={audioUrl}
            sections={sections}
            activeIndex={activeIndex}
            onTimeUpdate={handleTimeUpdate}
            onSectionChange={handleSectionChange}
          />
        </div>

        {/* Sidebar */}
        <div className="flex-1 overflow-y-auto">
          <SectionSidebar
            sections={sections}
            activeIndex={activeIndex}
            sessionId={sessionId}
            onSeek={handleSeek}
          />
        </div>
      </div>
    </div>
  )
}

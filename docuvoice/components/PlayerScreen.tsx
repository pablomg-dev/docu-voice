'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import AudioPlayer from '@/components/AudioPlayer'
import SectionSidebar from '@/components/SectionSidebar'
import ExportButtons from '@/components/ExportButtons'
import type { Section } from '@/types'

interface PlayerScreenProps {
  sessionId: string
  sections: Array<Section & { startTimestamp: number; endTimestamp: number }>
  title: string
  isDemo?: boolean
  onBack: () => void
}

export default function PlayerScreen({
  sessionId,
  sections,
  title,
  isDemo = false,
  onBack,
}: PlayerScreenProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [, setCurrentMs] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const audioUrl = isDemo
    ? '/demo/full.mp3'
    : `/api/download/${sessionId}`

  const handleTimeUpdate = useCallback((ms: number) => {
    setCurrentMs(ms)
  }, [])

  const handleSectionChange = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  // Seek from sidebar
  const handleSeek = useCallback((timestampMs: number, index: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = timestampMs / 1000
      audioRef.current.play()
    }
    setActiveIndex(index)
  }, [])

  // Expose audioRef to AudioPlayer via a callback ref pattern
  const setAudioRef = useCallback((el: HTMLAudioElement | null) => {
    audioRef.current = el
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <button
          onClick={onBack}
          className="min-h-[44px] min-w-[44px] rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Back to input"
        >
          ← Back
        </button>

        <h1 className="truncate text-sm font-semibold text-white">
          {title}
        </h1>

        <div className="flex items-center gap-2">
          {isDemo && (
            <span className="rounded-full bg-amber-900/60 px-2.5 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-500/40">
              Demo Mode
            </span>
          )}
          <ExportButtons sessionId={sessionId} title={title} />
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row">
        {/* Player */}
        <div className="md:w-80 md:shrink-0">
          <AudioPlayerWithRef
            audioUrl={audioUrl}
            sections={sections}
            activeIndex={activeIndex}
            onTimeUpdate={handleTimeUpdate}
            onSectionChange={handleSectionChange}
            audioRefCallback={setAudioRef}
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

// Wrapper that exposes the internal audio element ref
interface AudioPlayerWithRefProps {
  audioUrl: string
  sections: Array<Section & { startTimestamp: number; endTimestamp: number }>
  activeIndex: number
  onTimeUpdate: (ms: number) => void
  onSectionChange: (index: number) => void
  audioRefCallback: (el: HTMLAudioElement | null) => void
}

function AudioPlayerWithRef({
  audioUrl,
  sections,
  activeIndex,
  onTimeUpdate,
  onSectionChange,
  audioRefCallback,
}: AudioPlayerWithRefProps) {
  // Mount a hidden audio element and pass its ref up
  useEffect(() => {
    return () => audioRefCallback(null)
  }, [audioRefCallback])

  return (
    <div>
      {/* The AudioPlayer manages its own internal ref; we use a portal-style
          approach: mount a shared audio element at this level */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRefCallback}
        src={audioUrl}
        className="hidden"
      />
      <AudioPlayer
        audioUrl={audioUrl}
        sections={sections}
        activeIndex={activeIndex}
        onTimeUpdate={onTimeUpdate}
        onSectionChange={onSectionChange}
      />
    </div>
  )
}

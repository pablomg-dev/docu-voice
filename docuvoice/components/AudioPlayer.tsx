'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Section } from '@/types'

interface AudioPlayerProps {
  audioUrl: string
  sections: Array<Section & { startTimestamp: number; endTimestamp: number }>
  activeIndex: number
  onTimeUpdate: (currentTimeMs: number) => void
  onSectionChange: (index: number) => void
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function AudioPlayer({
  audioUrl,
  sections,
  activeIndex,
  onTimeUpdate,
  onSectionChange,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)

  // Sync active section based on current time
  useEffect(() => {
    const idx = sections.findIndex(
      (s) => currentMs >= s.startTimestamp && currentMs < s.endTimestamp
    )
    if (idx !== -1 && idx !== activeIndex) {
      onSectionChange(idx)
    }
  }, [currentMs, sections, activeIndex, onSectionChange])

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const ms = audio.currentTime * 1000
    setCurrentMs(ms)
    onTimeUpdate(ms)
  }, [onTimeUpdate])

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    setDurationMs(audio.duration * 1000)
  }, [])

  const handleEnded = useCallback(() => {
    setIsPlaying(false)
  }, [])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play()
      setIsPlaying(true)
    }
  }

  function seekToSection(index: number) {
    const audio = audioRef.current
    if (!audio || !sections[index]) return
    audio.currentTime = sections[index].startTimestamp / 1000
    onSectionChange(index)
  }

  function prevSection() {
    seekToSection(Math.max(0, activeIndex - 1))
  }

  function nextSection() {
    seekToSection(Math.min(sections.length - 1, activeIndex + 1))
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current
    if (!audio || durationMs === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    audio.currentTime = (ratio * durationMs) / 1000
  }

  const progress = durationMs > 0 ? (currentMs / durationMs) * 100 : 0

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      {/* Hidden audio element — background playback works natively */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Progress bar */}
      <div
        role="slider"
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        tabIndex={0}
        className="mb-3 h-2 w-full cursor-pointer rounded-full bg-gray-700"
        onClick={handleProgressClick}
        onKeyDown={(e) => {
          const audio = audioRef.current
          if (!audio) return
          if (e.key === 'ArrowRight') audio.currentTime += 5
          if (e.key === 'ArrowLeft') audio.currentTime -= 5
        }}
      >
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Time */}
      <div className="mb-4 flex justify-between text-xs text-gray-500">
        <span>{formatTime(currentMs)}</span>
        <span>{formatTime(durationMs)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Previous section */}
        <button
          onClick={prevSection}
          disabled={activeIndex === 0}
          aria-label="Previous section"
          className="min-h-[44px] min-w-[44px] rounded-full p-2 text-gray-400 transition-colors hover:text-white disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061A1.125 1.125 0 0 1 21 8.689v8.122ZM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061a1.125 1.125 0 0 1 1.683.977v8.122Z" />
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="min-h-[44px] min-w-[44px] rounded-full bg-indigo-600 p-3 text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
        >
          {isPlaying ? (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {/* Next section */}
        <button
          onClick={nextSection}
          disabled={activeIndex === sections.length - 1}
          aria-label="Next section"
          className="min-h-[44px] min-w-[44px] rounded-full p-2 text-gray-400 transition-colors hover:text-white disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// Export seekTo helper for external use (sidebar play buttons)
export function useAudioSeek(audioRef: React.RefObject<HTMLAudioElement | null>) {
  return useCallback((timestampMs: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = timestampMs / 1000
    }
  }, [audioRef])
}

'use client'

import type { Section } from '@/types'

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  introduction: { label: 'Intro',    className: 'bg-blue-900/60 text-blue-300' },
  code:         { label: 'Code',     className: 'bg-purple-900/60 text-purple-300' },
  warning:      { label: 'Warning',  className: 'bg-yellow-900/60 text-yellow-300' },
  steps:        { label: 'Steps',    className: 'bg-green-900/60 text-green-300' },
}

interface SectionSidebarProps {
  sections: Array<Section & { startTimestamp: number; endTimestamp: number }>
  activeIndex: number
  sessionId: string
  onSeek: (timestampMs: number, index: number) => void
}

async function downloadBlob(url: string, filename: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(objectUrl)
}

export default function SectionSidebar({
  sections,
  activeIndex,
  sessionId,
  onSeek,
}: SectionSidebarProps) {
  return (
    <aside className="flex flex-col gap-1 overflow-y-auto" aria-label="Sections">
      {sections.map((section, i) => {
        const isActive = i === activeIndex
        const badge = TYPE_BADGE[section.type] ?? TYPE_BADGE.introduction

        return (
          <div
            key={i}
            onClick={() => onSeek(section.startTimestamp, i)}
            className={`group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
              isActive
                ? 'bg-indigo-900/50 ring-1 ring-indigo-500/50'
                : 'hover:bg-gray-800'
            }`}
          >
            {/* Section info */}
            <div className="flex min-h-[44px] flex-1 items-center gap-2">
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
              <span
                className={`truncate text-sm ${
                  isActive ? 'font-medium text-white' : 'text-gray-300'
                }`}
              >
                {section.title}
              </span>
            </div>

            {/* Download section button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                downloadBlob(
                  `/api/download/${sessionId}?section=${i}`,
                  `section-${i}-${section.type}.mp3`
                )
              }}
              aria-label={`Download section: ${section.title}`}
              className="min-h-[44px] min-w-[44px] shrink-0 cursor-pointer rounded-full p-2 text-gray-500 transition-colors hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
          </div>
        )
      })}
    </aside>
  )
}

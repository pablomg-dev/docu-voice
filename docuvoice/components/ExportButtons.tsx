'use client'

interface ExportButtonsProps {
  sessionId: string
  title: string
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

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'docuvoice-audio'
}

export default function ExportButtons({ sessionId, title }: ExportButtonsProps) {
  function handleDownloadFull() {
    const filename = `${slugify(title)}-${Date.now()}.mp3`
    downloadBlob(`/api/download/${sessionId}`, filename)
  }

  return (
    <button
      onClick={handleDownloadFull}
      aria-label="Download full audio as MP3"
      className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      Download Full Audio
    </button>
  )
}

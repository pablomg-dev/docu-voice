'use client'

import { useState } from 'react'
import ErrorBanner from '@/components/ErrorBanner'
import type { VoiceMode } from '@/lib/voiceMap'

const MAX_TEXT_LENGTH = 50_000
const MIN_TEXT_LENGTH = 100

type Tab = 'url' | 'text'

interface InputScreenProps {
  onSubmit: (input: { url?: string; text?: string; backgroundMusic: boolean; voiceMode: VoiceMode }) => void
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export default function InputScreen({ onSubmit }: InputScreenProps) {
  const [tab, setTab] = useState<Tab>('url')
  const [urlValue, setUrlValue] = useState('')
  const [textValue, setTextValue] = useState('')
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('single')
  const [error, setError] = useState<string | null>(null)

  function validate(): string | null {
    if (tab === 'url') {
      if (!urlValue.trim()) return 'Please enter a URL.'
      if (!isValidUrl(urlValue.trim())) return 'The URL you entered is not valid. Please include http:// or https://.'
    } else {
      if (!textValue.trim()) return 'Please paste some content.'
      if (textValue.trim().length < MIN_TEXT_LENGTH)
        return `Content is too short (${textValue.trim().length} chars). Please provide at least ${MIN_TEXT_LENGTH} characters.`
      if (textValue.length > MAX_TEXT_LENGTH)
        return `Content exceeds the ${MAX_TEXT_LENGTH.toLocaleString()}-character limit.`
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    if (tab === 'url') {
      onSubmit({ url: urlValue.trim(), backgroundMusic: false, voiceMode })
    } else {
      onSubmit({ text: textValue, backgroundMusic: false, voiceMode })
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Docu<span className="text-indigo-400">Voice</span>
          </h1>
          <p className="mt-2 text-gray-400">
            Turn any documentation into a multi-voice audio podcast.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
          {/* Tabs */}
          <div className="mb-5 flex rounded-lg bg-gray-800 p-1">
            {(['url', 'text'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null) }}
                className={`min-h-[44px] flex-1 cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  tab === t
                    ? 'bg-gray-700 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t === 'url' ? 'Paste URL' : 'Paste Text'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {tab === 'url' ? (
              <div className="mb-4">
                <label htmlFor="url-input" className="mb-1.5 block text-sm font-medium text-gray-300">
                  Documentation URL
                </label>
                <input
                  id="url-input"
                  type="url"
                  value={urlValue}
                  onChange={(e) => { setUrlValue(e.target.value); setError(null) }}
                  placeholder="https://github.com/vercel/next.js"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  aria-describedby={error ? 'input-error' : undefined}
                />
              </div>
            ) : (
              <div className="mb-4">
                <label htmlFor="text-input" className="mb-1.5 block text-sm font-medium text-gray-300">
                  Markdown / Plain Text
                </label>
                <textarea
                  id="text-input"
                  value={textValue}
                  onChange={(e) => { setTextValue(e.target.value); setError(null) }}
                  placeholder="Paste your README or documentation here..."
                  rows={10}
                  maxLength={MAX_TEXT_LENGTH}
                  className="w-full resize-y rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  aria-describedby={error ? 'input-error' : undefined}
                />
                <p className="mt-1 text-right text-xs text-gray-500">
                  {textValue.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()}
                </p>
              </div>
            )}

            {/* Voice mode selector */}
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-gray-300">Voice mode</p>
              <div className="flex gap-3">
                {([
                  { value: 'single', label: 'Single Voice', desc: 'One consistent voice throughout' },
                  { value: 'multi',  label: 'Multi Voice',  desc: 'Different voice per section type' },
                ] as { value: VoiceMode; label: string; desc: string }[]).map(({ value, label, desc }) => (
                  <label
                    key={value}
                    className={`flex flex-1 cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 transition-colors ${
                      voiceMode === value
                        ? 'border-indigo-500 bg-indigo-950/40 text-white'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="voiceMode"
                      value={value}
                      checked={voiceMode === value}
                      onChange={() => setVoiceMode(value)}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs opacity-70">{desc}</span>
                  </label>
                ))}
              </div>
            </div>


            {/* Error */}
            {error && (
              <div id="input-error" className="mb-4">
                <ErrorBanner message={error} onDismiss={() => setError(null)} />
              </div>
            )}

            {/* Actions */}
            <button
              type="submit"
              className="min-h-[44px] w-full cursor-pointer rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            >
              Generate Audio
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

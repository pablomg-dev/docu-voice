'use client'

import { useEffect, useRef, useState } from 'react'
import ErrorBanner from '@/components/ErrorBanner'
import type { ProcessingStep, StepStatus, ProgressEvent } from '@/types'
import type { VoiceMode } from '@/lib/voiceMap'

const STEPS: { key: ProcessingStep; label: string }[] = [
  { key: 'parsing',     label: 'Parsing content' },
  { key: 'voices',      label: 'Generating voices' },
  { key: 'transitions', label: 'Adding transitions' },
  { key: 'ready',       label: 'Ready!' },
]

interface StepState {
  status: StepStatus
  message?: string
}

type StepMap = Record<ProcessingStep, StepState>

const initialSteps = (): StepMap => ({
  parsing:     { status: 'pending' },
  voices:      { status: 'pending' },
  transitions: { status: 'pending' },
  ready:       { status: 'pending' },
})

interface ProgressIndicatorProps {
  requestBody: { url?: string; text?: string; backgroundMusic: boolean; voiceMode: VoiceMode }
  onComplete: (sessionId: string) => void
  onRetry: () => void
}

export default function ProgressIndicator({ requestBody, onComplete, onRetry }: ProgressIndicatorProps) {
  const [steps, setSteps] = useState<StepMap>(initialSteps)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [languageWarning, setLanguageWarning] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    abortRef.current = controller

    async function run() {
      try {
        const res = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Unknown error' }))
          setErrorMessage(data.error ?? 'Failed to start processing.')
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          setErrorMessage('No response stream received.')
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event: ProgressEvent = JSON.parse(line.slice(6))
              setSteps((prev) => ({
                ...prev,
                [event.step]: { status: event.status, message: event.message },
              }))

              if (event.status === 'warning') {
                setLanguageWarning(event.message ?? null)
                // Don't stop — continue processing
                continue
              }

              if (event.status === 'error') {
                setErrorMessage(event.message ?? 'An error occurred during processing.')
                return
              }

              if (event.step === 'ready' && event.status === 'complete' && event.sessionId) {
                onComplete(event.sessionId)
                return
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setErrorMessage('Connection lost. Please try again.')
        }
      }
    }

    run()
    return () => controller.abort()
  }, [requestBody, onComplete])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 py-12">
      <div className="w-full max-w-md">
        <h2 className="mb-8 text-center text-2xl font-semibold text-white">
          Generating your podcast…
        </h2>

        <ol className="space-y-4">
          {STEPS.map(({ key, label }) => {
            const { status } = steps[key]
            return (
              <li key={key} className="flex items-center gap-4">
                {/* Status icon */}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  {status === 'complete' && (
                    <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                  {status === 'active' && (
                    <svg className="h-6 w-6 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  )}
                  {status === 'error' && (
                    <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  )}
                  {status === 'warning' && (
                    <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374l7.108-12.748c.866-1.5 3.032-1.5 3.898 0l7.108 12.748Z" />
                    </svg>
                  )}
                  {status === 'pending' && (
                    <span className="h-3 w-3 rounded-full bg-gray-700" aria-hidden="true" />
                  )}
                </span>

                {/* Label */}
                <span
                  className={`text-sm font-medium ${
                    status === 'complete' ? 'text-green-400' :
                    status === 'active'   ? 'text-indigo-300' :
                    status === 'error'    ? 'text-red-400' :
                    status === 'warning'  ? 'text-amber-400' :
                    'text-gray-500'
                  }`}
                >
                  {label}
                </span>
              </li>
            )
          })}
        </ol>

        {languageWarning && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-sm text-amber-200">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <span>{languageWarning}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-8">
            <ErrorBanner
              message={errorMessage}
              onDismiss={() => setErrorMessage(null)}
              onRetry={onRetry}
            />
          </div>
        )}
      </div>
    </div>
  )
}

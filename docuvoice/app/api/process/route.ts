import { NextRequest } from 'next/server'
import { fetchContent, InvalidUrlError, HttpError, TimeoutError, NetworkError } from '@/lib/contentFetcher'
import { parse, ParseError } from '@/lib/parser'
import { generateAll } from '@/lib/ttsEngine'
import { generateTransitions } from '@/lib/sfxEngine'
import { assemble } from '@/lib/audioAssembler'
import { set as storeSet } from '@/lib/sessionStore'
import { looksLikeSpanish } from '@/lib/voiceMap'
import type { VoiceMode } from '@/lib/voiceMap'
import type { ProgressEvent, ProcessingStep } from '@/types'

const MIN_TEXT_LENGTH = 100

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sseEvent(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Guard: API key must be present
  if (!process.env.ELEVENLABS_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Server is not configured: ELEVENLABS_API_KEY is missing.', code: 'CONFIG_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let body: { url?: string; text?: string; backgroundMusic?: boolean; voiceMode?: VoiceMode }
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body.', code: 'BAD_REQUEST' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { url, text, voiceMode = 'single' } = body
  const backgroundMusic = false

  // Validate: must have url or text
  if (!url && !text) {
    return new Response(
      JSON.stringify({ error: 'Provide either a URL or text content.', code: 'MISSING_INPUT' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Validate: raw text minimum length
  if (text && !url && text.trim().length < MIN_TEXT_LENGTH) {
    return new Response(
      JSON.stringify({
        error: `Content is too short. Please provide at least ${MIN_TEXT_LENGTH} characters.`,
        code: 'CONTENT_TOO_SHORT',
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ─── SSE stream ─────────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: ProgressEvent) {
        controller.enqueue(encoder.encode(sseEvent(event)))
      }

      function emitError(step: ProcessingStep, message: string) {
        emit({ step, status: 'error', message })
        controller.close()
      }

      try {
        // ── Step 1: Parsing ──────────────────────────────────────────────────
        emit({ step: 'parsing', status: 'active' })

        let rawContent: string
        let docTitle = 'DocuVoice Audio'

        if (url) {
          try {
            const result = await fetchContent(url)
            rawContent = result.content
          } catch (err) {
            if (err instanceof InvalidUrlError) {
              return emitError('parsing', `Invalid URL: ${(err as Error).message}`)
            }
            if (err instanceof HttpError) {
              return emitError('parsing', `Could not reach the URL (HTTP ${(err as HttpError).statusCode}).`)
            }
            if (err instanceof TimeoutError) {
              return emitError('parsing', 'The request timed out after 10 seconds.')
            }
            if (err instanceof NetworkError) {
              return emitError('parsing', 'Network error: could not reach the URL.')
            }
            return emitError('parsing', 'Failed to fetch content.')
          }
        } else {
          rawContent = text!
        }

        let sections
        try {
          sections = await parse(rawContent)
        } catch (err) {
          if (err instanceof ParseError) {
            return emitError('parsing', err.message)
          }
          return emitError('parsing', 'Failed to parse content.')
        }

        // Extract document title from first section
        if (sections.length > 0) docTitle = sections[0].title

        // Language detection — warn if content looks Spanish
        const fullText = sections.map((s) => s.text).join(' ')
        if (looksLikeSpanish(fullText)) {
          emit({
            step: 'parsing',
            status: 'warning',
            message:
              'This document appears to be in Spanish. The selected voices are English-trained and may sound unnatural. Consider using Single Voice mode for better results.',
          })
        }

        emit({ step: 'parsing', status: 'complete' })

        // ── Step 2: Generating voices ────────────────────────────────────────
        emit({ step: 'voices', status: 'active' })

        let segments
        try {
          segments = await generateAll(sections, undefined, voiceMode)
        } catch (err) {
          return emitError('voices', `Voice generation failed: ${(err as Error).message}`)
        }

        emit({ step: 'voices', status: 'complete' })

        // ── Step 3: Adding transitions ───────────────────────────────────────
        emit({ step: 'transitions', status: 'active' })

        // transitions count = sections - 1
        const transitionCount = Math.max(0, sections.length - 1)
        const transitions = await generateTransitions(transitionCount)

        emit({ step: 'transitions', status: 'complete' })

        // ── Assemble timeline ────────────────────────────────────────────────
        const timeline = await assemble({
          sections,
          segments,
          transitions,
          backgroundMusic: undefined,
          title: docTitle,
        })

        storeSet(timeline.sessionId, timeline)

        // ── Step 4: Ready ────────────────────────────────────────────────────
        emit({ step: 'ready', status: 'complete', sessionId: timeline.sessionId })
        controller.close()
      } catch (err) {
        emitError('ready', `Unexpected error: ${(err as Error).message}`)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

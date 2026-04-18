import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { getVoiceId } from '@/lib/voiceMap'
import type { VoiceMode } from '@/lib/voiceMap'
import type { Section, AudioSegment } from '@/types'

// eleven_turbo_v2_5 is the current model available on the free tier.
// eleven_monolingual_v1 is deprecated and removed from free tier.
const TTS_MODEL = 'eleven_turbo_v2_5'

// ─── Error ────────────────────────────────────────────────────────────────────

export class TtsError extends Error {
  readonly code = 'TTS_ERROR'
  constructor(sectionIndex: number, cause?: unknown) {
    // Surface the actual ElevenLabs error message so it reaches the UI
    const causeMessage = cause instanceof Error ? cause.message : String(cause ?? '')
    super(`TTS generation failed for section ${sectionIndex}: ${causeMessage}`)
    this.name = 'TtsError'
    if (cause instanceof Error) this.cause = cause
  }
}

// ─── Client factory ───────────────────────────────────────────────────────────

function getClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error(
      'ELEVENLABS_API_KEY environment variable is not set. ' +
        'Please add it to .env.local before starting the server.'
    )
  }
  return new ElevenLabsClient({ apiKey })
}

// ─── Core generation ──────────────────────────────────────────────────────────

/**
 * Generate TTS audio for a single section.
 * Retries once on failure before throwing TtsError.
 */
export async function generateOne(
  section: Section,
  client?: ElevenLabsClient,
  voiceMode: VoiceMode = 'multi'
): Promise<AudioSegment> {
  const c = client ?? getClient()
  const voiceId = getVoiceId(section.type, voiceMode)

  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const audioStream = await c.textToSpeech.convert(voiceId, {
        text: section.text,
        modelId: TTS_MODEL,
        outputFormat: 'mp3_44100_128',
      })

      // Collect the async-iterable stream into a Buffer
      const chunks: Buffer[] = []
      for await (const chunk of audioStream as unknown as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const buffer = Buffer.concat(chunks)

      // Estimate duration: MP3 at 128 kbps → bytes / (128000 / 8) seconds
      const durationMs = Math.round((buffer.length / 16000) * 1000)

      return { buffer, durationMs }
    } catch (err) {
      lastError = err
      // Log the raw error on first attempt so it's visible in server logs
      if (attempt === 0) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[TTS] Attempt 1 failed for section ${section.index} (voice ${voiceId}): ${msg}`)
      }
    }
  }

  throw new TtsError(section.index, lastError)
}

/**
 * Generate TTS audio for all sections in order.
 * Sections are processed sequentially to avoid rate-limit issues.
 */
export async function generateAll(
  sections: Section[],
  client?: ElevenLabsClient,
  voiceMode: VoiceMode = 'multi'
): Promise<AudioSegment[]> {
  const c = client ?? getClient()
  const results: AudioSegment[] = []

  for (const section of sections) {
    const segment = await generateOne(section, c, voiceMode)
    results.push(segment)
  }

  return results
}

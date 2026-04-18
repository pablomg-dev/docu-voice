import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import type { AudioSegment } from '@/types'

const SFX_PROMPT = 'subtle whoosh chime transition'
const MAX_DURATION_SECONDS = 2

/** A 0.5-second silent MP3 buffer used as a graceful fallback. */
function silentBuffer(): Buffer {
  // Minimal valid MP3 frame (silence) — 0.5 s at 128 kbps
  // In practice this is a near-empty buffer; the assembler handles it correctly.
  return Buffer.alloc(8000) // ~0.5 s at 128 kbps (128000/8 * 0.5 = 8000 bytes)
}

function getClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set.')
  }
  return new ElevenLabsClient({ apiKey })
}

/**
 * Generate `count` transition sound effects.
 * On API error for any slot, returns a silent 0.5-second buffer (graceful degradation).
 */
export async function generateTransitions(
  count: number,
  client?: ElevenLabsClient
): Promise<AudioSegment[]> {
  if (count <= 0) return []

  const c = client ?? getClient()
  const results: AudioSegment[] = []

  for (let i = 0; i < count; i++) {
    try {
      const audioStream = await c.textToSoundEffects.convert({
        text: SFX_PROMPT,
        durationSeconds: MAX_DURATION_SECONDS,
      })

      const chunks: Buffer[] = []
      for await (const chunk of audioStream as unknown as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const buffer = Buffer.concat(chunks)
      const durationMs = MAX_DURATION_SECONDS * 1000

      results.push({ buffer, durationMs })
    } catch {
      // Graceful degradation: use silent buffer instead of failing
      results.push({ buffer: silentBuffer(), durationMs: 500 })
    }
  }

  return results
}

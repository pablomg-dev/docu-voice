import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import type { VoicesResponse, VoiceEntry } from '@/types'

// Static fallback list — used when the ElevenLabs API is unavailable
const FALLBACK_VOICES: VoiceEntry[] = [
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
]

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) {
    const response: VoicesResponse = { voices: FALLBACK_VOICES, stale: true }
    return Response.json(response)
  }

  try {
    const client = new ElevenLabsClient({ apiKey })
    const result = await client.voices.getAll()

    const voices: VoiceEntry[] = (result.voices ?? []).map((v) => ({
      voice_id: v.voiceId,
      name: v.name ?? 'Unknown',
    }))

    const response: VoicesResponse = { voices }
    return Response.json(response)
  } catch {
    // Graceful fallback: return static list with stale indicator
    const response: VoicesResponse = { voices: FALLBACK_VOICES, stale: true }
    return Response.json(response)
  }
}

import type { SectionType } from '@/types'

/**
 * Maps each SectionType to its ElevenLabs voice ID.
 *
 * Voice assignments:
 *   introduction → Jessica (calm, clear narrator)   — replaces Rachel (library voice, not on free tier)
 *   code         → Adam    (neutral, technical)
 *   warning      → Antoni  (serious, alert)
 *   steps        → Bella   (instructional, friendly)
 *
 * Voice IDs are stable ElevenLabs pre-made voice identifiers verified against
 * the eleven_turbo_v2_5 model on the free tier.
 */
export const VOICE_MAP: Record<SectionType, { name: string; voiceId: string }> = {
  introduction: { name: 'Jessica', voiceId: 'cgSgspJ2msm6clMCkdW9' },
  code:         { name: 'Adam',    voiceId: 'pNInz6obpgDQGcFmaJgB' },
  warning:      { name: 'Antoni',  voiceId: 'ErXwobaYiN019PkySvjV' },
  steps:        { name: 'Bella',   voiceId: 'EXAVITQu4vr4xnSDxMaL' },
}

/** Voice used for all sections in "Single Voice" mode. */
export const SINGLE_VOICE = { name: 'Jessica', voiceId: 'cgSgspJ2msm6clMCkdW9' }

export type VoiceMode = 'single' | 'multi'

/**
 * Returns the ElevenLabs voice ID for the given section type.
 * In 'single' mode every section uses the same voice.
 */
export function getVoiceId(type: SectionType, mode: VoiceMode = 'multi'): string {
  if (mode === 'single') return SINGLE_VOICE.voiceId
  return VOICE_MAP[type].voiceId
}

/**
 * Returns the human-readable voice name for the given section type.
 */
export function getVoiceName(type: SectionType, mode: VoiceMode = 'multi'): string {
  if (mode === 'single') return SINGLE_VOICE.name
  return VOICE_MAP[type].name
}

// ─── Language detection ───────────────────────────────────────────────────────

const SPANISH_MARKERS = [
  'instalación', 'configuración', 'uso', 'inicio', 'guía',
  'descripción', 'requisitos', 'ejemplo', 'pasos', 'notas',
  'advertencia', 'importante', 'también', 'para', 'con',
  'está', 'son', 'una', 'los', 'las', 'del', 'que',
]

/**
 * Returns true if the text appears to be primarily Spanish.
 * Checks for a minimum density of common Spanish words.
 */
export function looksLikeSpanish(text: string): boolean {
  const lower = text.toLowerCase()
  const words = lower.match(/\b\w+\b/g) ?? []
  if (words.length < 20) return false
  const hits = SPANISH_MARKERS.filter((w) => lower.includes(w)).length
  // 4+ distinct Spanish markers is a strong signal
  return hits >= 4
}

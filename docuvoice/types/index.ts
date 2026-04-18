// ─── Section types ────────────────────────────────────────────────────────────

export type SectionType = 'introduction' | 'code' | 'warning' | 'steps'

export interface Section {
  index: number
  title: string
  type: SectionType
  text: string
  startTimestamp?: number
  endTimestamp?: number
}

// ─── Audio types ──────────────────────────────────────────────────────────────

export interface AudioSegment {
  buffer: Buffer
  durationMs: number
}

export interface AudioTimeline {
  sessionId: string
  fullMp3: Buffer
  /** Individual section MP3 buffers in document order */
  sectionMp3s: Buffer[]
  /** Sections with resolved start/end timestamps (ms from timeline start) */
  sections: Array<Section & { startTimestamp: number; endTimestamp: number }>
  createdAt: Date
  /** Document title derived from the first heading, used for filenames */
  title: string
}

// ─── Processing / SSE types ───────────────────────────────────────────────────

export type ProcessingStep = 'parsing' | 'voices' | 'transitions' | 'ready'
export type StepStatus = 'pending' | 'active' | 'complete' | 'error' | 'warning'

export interface ProgressEvent {
  step: ProcessingStep
  status: StepStatus
  /** Human-readable message, present on error events */
  message?: string
  /** Present only on the 'ready' event */
  sessionId?: string
}

// ─── API response types ───────────────────────────────────────────────────────

export interface ApiError {
  error: string
  code: string
}

export interface VoiceEntry {
  voice_id: string
  name: string
}

export interface VoicesResponse {
  voices: VoiceEntry[]
  stale?: boolean
}

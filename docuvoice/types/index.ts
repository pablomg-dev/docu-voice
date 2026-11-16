// ─── Section types ────────────────────────────────────────────────────────────

export type SectionType = 'introduction' | 'code' | 'warning' | 'steps'

/** Immutable GitHub revision metadata for a narrated README. */
export interface SourceMetadata {
  /** Original user-facing GitHub URL (typically https://github.com/owner/repo). */
  url: string
  /** owner/repo */
  repo: string
  /** Default branch name resolved at fetch time. */
  ref: string
  /** Exact commit SHA the README was downloaded from. */
  commitSha: string
  /** Path to the README within the repo (e.g. README.md). */
  path: string
}

export interface Section {
  index: number
  title: string
  type: SectionType
  text: string
  startTimestamp?: number
  endTimestamp?: number
  /** Markdown heading depth (1–6). Null for preamble / non-heading sections. */
  headingLevel?: number | null
  /** GitHub-compatible heading anchor. Null when not derived from a heading. */
  anchor?: string | null
  /** Permalink to the source revision (+ optional #anchor). */
  sourceUrl?: string | null
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
  /** Present when the document was fetched from a pinned GitHub revision. */
  source?: SourceMetadata
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

import type { AudioTimeline } from '@/types'

const TTL_MS = 30 * 60 * 1000 // 30 minutes

interface StoreEntry {
  timeline: AudioTimeline
  expiresAt: number
}

// Module-level singleton — survives hot-reloads in dev via globalThis
declare global {
  // eslint-disable-next-line no-var
  var __docuvoiceSessionStore: Map<string, StoreEntry> | undefined
}

function getStore(): Map<string, StoreEntry> {
  if (!globalThis.__docuvoiceSessionStore) {
    globalThis.__docuvoiceSessionStore = new Map()
  }
  return globalThis.__docuvoiceSessionStore
}

/** Retrieve a session by ID. Returns undefined if not found or expired. */
export function get(sessionId: string): AudioTimeline | undefined {
  const store = getStore()
  const entry = store.get(sessionId)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    store.delete(sessionId)
    return undefined
  }
  return entry.timeline
}

/** Store a timeline under the given session ID with a 30-minute TTL. */
export function set(sessionId: string, timeline: AudioTimeline): void {
  getStore().set(sessionId, {
    timeline,
    expiresAt: Date.now() + TTL_MS,
  })
}

/** Remove a session explicitly. */
export function del(sessionId: string): void {
  getStore().delete(sessionId)
}

/** Generate a new unique session ID. */
export function createSessionId(): string {
  return crypto.randomUUID()
}

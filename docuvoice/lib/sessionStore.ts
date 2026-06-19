import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import type { AudioTimeline } from '@/types'

const TTL_MS = 30 * 60 * 1000 // 30 minutes
const SESSION_DIR = path.join(os.tmpdir(), 'docuvoice-sessions')

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

/** Save session data to /tmp/ as files (for Vercel cross-instance persistence). */
async function persistToDisk(sessionId: string, entry: StoreEntry): Promise<void> {
  try {
    const dir = path.join(SESSION_DIR, sessionId)
    await fs.mkdir(dir, { recursive: true })

    await fs.writeFile(path.join(dir, 'full.mp3'), entry.timeline.fullMp3)

    for (let i = 0; i < entry.timeline.sectionMp3s.length; i++) {
      await fs.writeFile(path.join(dir, `section-${i}.mp3`), entry.timeline.sectionMp3s[i])
    }

    const metadata = {
      sessionId: entry.timeline.sessionId,
      title: entry.timeline.title,
      createdAt: entry.timeline.createdAt.toISOString(),
      sections: entry.timeline.sections.map((s) => ({
        index: s.index,
        title: s.title,
        type: s.type,
        text: s.text,
        startTimestamp: s.startTimestamp,
        endTimestamp: s.endTimestamp,
      })),
      sectionCount: entry.timeline.sectionMp3s.length,
      expiresAt: entry.expiresAt,
    }

    await fs.writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata), 'utf-8')
  } catch {
    // Best-effort — silent fallback
  }
}

/** Load session data from /tmp/ files. */
async function loadFromDisk(sessionId: string): Promise<StoreEntry | undefined> {
  try {
    const dir = path.join(SESSION_DIR, sessionId)
    const raw = await fs.readFile(path.join(dir, 'metadata.json'), 'utf-8')
    const meta = JSON.parse(raw)

    if (Date.now() > meta.expiresAt) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
      return undefined
    }

    const fullMp3 = await fs.readFile(path.join(dir, 'full.mp3'))

    const sectionMp3s: Buffer[] = []
    for (let i = 0; i < meta.sectionCount; i++) {
      sectionMp3s.push(await fs.readFile(path.join(dir, `section-${i}.mp3`)))
    }

    return {
      timeline: {
        sessionId: meta.sessionId,
        title: meta.title,
        createdAt: new Date(meta.createdAt),
        sections: meta.sections,
        sectionMp3s,
        fullMp3,
      },
      expiresAt: meta.expiresAt,
    }
  } catch {
    return undefined
  }
}

/** Retrieve a session — checks memory first, then falls back to disk. */
export async function get(sessionId: string): Promise<AudioTimeline | undefined> {
  const store = getStore()
  const entry = store.get(sessionId)
  if (entry) {
    if (Date.now() > entry.expiresAt) {
      store.delete(sessionId)
      return undefined
    }
    return entry.timeline
  }

  const fromDisk = await loadFromDisk(sessionId)
  if (fromDisk) {
    store.set(sessionId, fromDisk)
    return fromDisk.timeline
  }

  return undefined
}

/** Store a timeline under the given session ID with a 30-minute TTL. */
export async function set(sessionId: string, timeline: AudioTimeline): Promise<void> {
  const expiresAt = Date.now() + TTL_MS
  getStore().set(sessionId, { timeline, expiresAt })

  // Fire-and-forget disk persistence (never blocks the response)
  persistToDisk(sessionId, { timeline, expiresAt })
}

/** Remove a session explicitly. */
export async function del(sessionId: string): Promise<void> {
  getStore().delete(sessionId)
  await fs.rm(path.join(SESSION_DIR, sessionId), { recursive: true, force: true }).catch(() => {})
}

/** Generate a new unique session ID. */
export function createSessionId(): string {
  return crypto.randomUUID()
}

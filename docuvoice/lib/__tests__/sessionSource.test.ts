import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { set as storeSet, get as storeGet, del as storeDel } from '@/lib/sessionStore'
import type { AudioTimeline, SourceMetadata } from '@/types'

const SOURCE: SourceMetadata = {
  url: 'https://github.com/acme/app',
  repo: 'acme/app',
  ref: 'main',
  commitSha: 'cccccccccccccccccccccccccccccccccccccccc',
  path: 'README.md',
}

function makeTimeline(sessionId: string, withSource: boolean): AudioTimeline {
  return {
    sessionId,
    title: 'Demo',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    fullMp3: Buffer.from('full'),
    sectionMp3s: [Buffer.from('sec0')],
    ...(withSource ? { source: SOURCE } : {}),
    sections: [
      {
        index: 0,
        title: 'Introduction',
        type: 'introduction',
        text: 'Hello',
        startTimestamp: 0,
        endTimestamp: 1000,
        headingLevel: null,
        anchor: null,
        sourceUrl: withSource
          ? `https://github.com/acme/app/blob/${SOURCE.commitSha}/README.md`
          : null,
      },
      {
        index: 1,
        title: 'Install',
        type: 'steps',
        text: 'Install it',
        startTimestamp: 1000,
        endTimestamp: 2000,
        headingLevel: 2,
        anchor: 'install',
        sourceUrl: withSource
          ? `https://github.com/acme/app/blob/${SOURCE.commitSha}/README.md#install`
          : null,
      },
    ],
  }
}

describe('sessionStore source persistence', () => {
  const ids: string[] = []

  afterEach(async () => {
    for (const id of ids.splice(0)) {
      await storeDel(id)
      // Also clear any disk leftovers under tmp
      await fs
        .rm(path.join(os.tmpdir(), 'docuvoice-sessions', id), { recursive: true, force: true })
        .catch(() => {})
    }
  })

  it('persists and reloads source + heading fields', async () => {
    const sessionId = crypto.randomUUID()
    ids.push(sessionId)
    await storeSet(sessionId, makeTimeline(sessionId, true))

    const fromMemory = await storeGet(sessionId)
    expect(fromMemory?.source).toEqual(SOURCE)
    expect(fromMemory?.sections[1].anchor).toBe('install')

    // Wait for fire-and-forget disk write, then force a disk reload
    const metaPath = path.join(os.tmpdir(), 'docuvoice-sessions', sessionId, 'metadata.json')
    for (let i = 0; i < 40; i++) {
      try {
        await fs.access(metaPath)
        break
      } catch {
        await new Promise((r) => setTimeout(r, 25))
      }
    }

    const store = (globalThis as { __docuvoiceSessionStore?: Map<string, unknown> })
      .__docuvoiceSessionStore
    store?.delete(sessionId)

    const loaded = await storeGet(sessionId)
    expect(loaded?.source).toEqual(SOURCE)
    expect(loaded?.sections[0].headingLevel).toBeNull()
    expect(loaded?.sections[0].anchor).toBeNull()
    expect(loaded?.sections[1].anchor).toBe('install')
    expect(loaded?.sections[1].sourceUrl).toContain(`#install`)
    expect(loaded?.sections[1].sourceUrl).toContain(SOURCE.commitSha)
  })

  it('supports legacy timelines without source', async () => {
    const sessionId = crypto.randomUUID()
    ids.push(sessionId)
    await storeSet(sessionId, makeTimeline(sessionId, false))
    const loaded = await storeGet(sessionId)
    expect(loaded?.source).toBeUndefined()
    expect(loaded?.sections[0].title).toBe('Introduction')
  })
})

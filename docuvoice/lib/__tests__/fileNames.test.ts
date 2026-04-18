import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { deriveFilename } from '@/lib/fileNames'

describe('deriveFilename', () => {
  it('produces a slug from a normal title', () => {
    const result = deriveFilename('Getting Started')
    expect(result).toMatch(/^getting-started-\d+\.mp3$/)
  })

  it('appends a suffix when provided', () => {
    const result = deriveFilename('My Doc', 'section-0-introduction')
    expect(result).toContain('section-0-introduction')
    expect(result).toMatch(/\.mp3$/)
  })

  it('falls back to docuvoice-audio for empty title', () => {
    const result = deriveFilename('')
    expect(result).toMatch(/^docuvoice-audio-\d+\.mp3$/)
  })

  it('strips special characters', () => {
    const result = deriveFilename('Hello! World? #1')
    expect(result).not.toMatch(/[!?#]/)
    expect(result).toMatch(/\.mp3$/)
  })

  // Property 5: Export filename derivation
  it('Property 5 — always produces a valid .mp3 filename for any title', () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        const filename = deriveFilename(title)
        // Must end with .mp3
        expect(filename).toMatch(/\.mp3$/)
        // Must not contain illegal filename characters
        expect(filename).not.toMatch(/[<>:"/\\|?*\x00-\x1f]/)
        // Must not be empty before the extension
        expect(filename.length).toBeGreaterThan(4)
      })
    )
  })
})

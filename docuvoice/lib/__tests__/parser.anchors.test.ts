import { describe, expect, it } from 'vitest'
import { parse } from '@/lib/parser'
import type { SourceMetadata } from '@/types'

const SOURCE: SourceMetadata = {
  url: 'https://github.com/acme/app',
  repo: 'acme/app',
  ref: 'main',
  commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  path: 'README.md',
}

describe('parser heading anchors', () => {
  it('assigns null heading metadata to the Introduction preamble', async () => {
    const sections = await parse(
      'Preamble text before any heading.\n\n## Later\n\nBody.\n'
    )
    expect(sections[0].title).toBe('Introduction')
    expect(sections[0].headingLevel).toBeNull()
    expect(sections[0].anchor).toBeNull()
    expect(sections[1].headingLevel).toBe(2)
    expect(sections[1].anchor).toBe('later')
  })

  it('slugs simple headings and preserves H1–H6 levels', async () => {
    const md = [
      '# Alpha',
      '',
      'One.',
      '',
      '## Beta',
      '',
      'Two.',
      '',
      '###### Zeta',
      '',
      'Six.',
    ].join('\n')
    const sections = await parse(md)
    expect(sections.map((s) => [s.headingLevel, s.anchor])).toEqual([
      [1, 'alpha'],
      [2, 'beta'],
      [6, 'zeta'],
    ])
  })

  it('handles accents, punctuation, unicode, and emojis', async () => {
    const md = [
      '# Café résumé',
      '',
      'A.',
      '',
      '## Hello, World!!!',
      '',
      'B.',
      '',
      '## 日本語見出し',
      '',
      'C.',
      '',
      '## Ship it 🚀 now',
      '',
      'D.',
    ].join('\n')
    const sections = await parse(md)
    expect(sections[0].anchor).toBe('café-résumé')
    expect(sections[1].anchor).toBe('hello-world')
    expect(sections[2].anchor).toBe('日本語見出し')
    expect(sections[3].anchor).toMatch(/^ship-it/)
  })

  it('suffixes duplicate headings with -1, -2', async () => {
    const md = [
      '# Install',
      '',
      'First.',
      '',
      '## Install',
      '',
      'Second.',
      '',
      '### Install',
      '',
      'Third.',
    ].join('\n')
    const sections = await parse(md)
    expect(sections.map((s) => s.anchor)).toEqual(['install', 'install-1', 'install-2'])
  })

  it('advances slugger for empty discarded headings before a duplicate title', async () => {
    // First "Install" has no body → discarded; GitHub still reserves #install.
    const md = [
      '# Install',
      '',
      '## Install',
      '',
      'Body of the second Install.',
    ].join('\n')
    const sections = await parse(md)
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('Install')
    expect(sections[0].anchor).toBe('install-1')
  })

  it('handles three duplicate titles when the middle heading is discarded', async () => {
    const md = [
      '# Install',
      '',
      'First body.',
      '',
      '## Install',
      '',
      '### Install',
      '',
      'Third body.',
    ].join('\n')
    const sections = await parse(md)
    expect(sections.map((s) => ({ title: s.title, anchor: s.anchor }))).toEqual([
      { title: 'Install', anchor: 'install' },
      { title: 'Install', anchor: 'install-2' },
    ])
  })

  it('slugs empty headings with github-slugger rules', async () => {
    const md = '# \n\nEmpty one.\n\n# \n\nEmpty two.\n'
    const sections = await parse(md)
    expect(sections[0].title).toBe('Section')
    expect(sections[0].anchor).toBe('')
    expect(sections[1].anchor).toBe('-1')
  })

  it('does not invent anchors for non-heading sections and attaches sourceUrl when source is set', async () => {
    const sections = await parse(
      'Only preamble content that becomes Introduction.\n\n## Docs\n\nMore.\n',
      { source: SOURCE }
    )
    expect(sections[0].anchor).toBeNull()
    expect(sections[0].sourceUrl).toBe(
      `https://github.com/acme/app/blob/${SOURCE.commitSha}/README.md`
    )
    expect(sections[1].anchor).toBe('docs')
    expect(sections[1].sourceUrl).toBe(
      `https://github.com/acme/app/blob/${SOURCE.commitSha}/README.md#docs`
    )
  })

  it('leaves sourceUrl null when no source metadata is provided', async () => {
    const sections = await parse('## Alone\n\nBody.\n')
    expect(sections[0].sourceUrl).toBeNull()
    expect(sections[0].headingLevel).toBe(2)
  })

  it('keeps discarded-heading slug alignment in sourceUrl permalinks', async () => {
    const sections = await parse(
      '# Setup\n\n## Setup\n\nDo the setup.\n',
      { source: SOURCE }
    )
    expect(sections).toHaveLength(1)
    expect(sections[0].anchor).toBe('setup-1')
    expect(sections[0].sourceUrl).toBe(
      `https://github.com/acme/app/blob/${SOURCE.commitSha}/README.md#setup-1`
    )
  })
})

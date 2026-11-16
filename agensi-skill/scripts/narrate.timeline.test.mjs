import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildTimeline, parseSectionsDocument, splitDocumentForLimit } from './narrate.mjs'

const SOURCE = {
  url: 'https://github.com/acme/app',
  repo: 'acme/app',
  ref: 'main',
  commitSha: 'dddddddddddddddddddddddddddddddddddddddd',
  path: 'README.md',
}

describe('buildTimeline source compatibility', () => {
  it('omits source when not provided (legacy timelines)', () => {
    const timeline = buildTimeline({
      title: 'Legacy',
      mode: 'multi',
      assembly: 'ffmpeg',
      output: '/tmp/out.mp3',
      characters: 10,
      sfxByteLength: 0,
      sections: [
        {
          index: 0,
          title: 'Introduction',
          type: 'introduction',
          voiceName: 'Jessica',
          voiceId: 'cgSgspJ2msm6clMCkdW9',
          byteLength: 16000,
        },
      ],
    })
    assert.equal(timeline.source, undefined)
    assert.equal(timeline.sections[0].headingLevel, undefined)
    assert.equal(timeline.sections[0].anchor, undefined)
  })

  it('preserves optional source and section heading fields', () => {
    const timeline = buildTimeline({
      title: 'Pinned',
      mode: 'multi',
      assembly: 'ffmpeg',
      output: '/tmp/out.mp3',
      characters: 20,
      sfxByteLength: 0,
      source: SOURCE,
      sections: [
        {
          index: 0,
          title: 'Introduction',
          type: 'introduction',
          voiceName: 'Jessica',
          voiceId: 'cgSgspJ2msm6clMCkdW9',
          byteLength: 16000,
          headingLevel: null,
          anchor: null,
          sourceUrl: `https://github.com/acme/app/blob/${SOURCE.commitSha}/README.md`,
        },
        {
          index: 1,
          title: 'Install',
          type: 'steps',
          voiceName: 'Bella',
          voiceId: 'hpp4J3VqNfWAUOO0d1Us',
          byteLength: 16000,
          headingLevel: 2,
          anchor: 'install',
          sourceUrl: `https://github.com/acme/app/blob/${SOURCE.commitSha}/README.md#install`,
        },
      ],
    })
    assert.deepEqual(timeline.source, SOURCE)
    assert.equal(timeline.sections[0].headingLevel, null)
    assert.equal(timeline.sections[0].anchor, null)
    assert.equal(timeline.sections[1].anchor, 'install')
    assert.match(timeline.sections[1].sourceUrl, /#install$/)
  })
})

describe('parseSectionsDocument source metadata', () => {
  it('accepts documents without source', () => {
    const doc = parseSectionsDocument({
      title: 'Sample',
      sections: [
        { title: 'Introduction', type: 'introduction', text: 'Hello there friends.' },
      ],
    })
    assert.equal(doc.source, undefined)
    assert.equal(doc.sections[0].headingLevel, undefined)
  })

  it('accepts optional source and section fields', () => {
    const doc = parseSectionsDocument({
      title: 'Sample',
      source: SOURCE,
      sections: [
        {
          title: 'Introduction',
          type: 'introduction',
          text: 'Hello there friends.',
          headingLevel: null,
          anchor: null,
          sourceUrl: `https://github.com/acme/app/blob/${SOURCE.commitSha}/README.md`,
        },
        {
          title: 'Install',
          type: 'steps',
          text: 'First clone. Second install.',
          headingLevel: 2,
          anchor: 'install',
          sourceUrl: `https://github.com/acme/app/blob/${SOURCE.commitSha}/README.md#install`,
        },
      ],
    })
    assert.deepEqual(doc.source, SOURCE)
    assert.equal(doc.sections[1].anchor, 'install')
  })
})

describe('splitDocumentForLimit preserves source', () => {
  it('keeps document source and first-chunk heading metadata', () => {
    const long = 'word '.repeat(2000).trim()
    const doc = splitDocumentForLimit(
      {
        title: 'Big',
        source: SOURCE,
        sections: [
          {
            index: 0,
            title: 'Install',
            type: 'steps',
            text: long,
            headingLevel: 2,
            anchor: 'install',
            sourceUrl: `https://github.com/acme/app/blob/${SOURCE.commitSha}/README.md#install`,
          },
        ],
      },
      500
    )
    assert.deepEqual(doc.source, SOURCE)
    assert.equal(doc.sections[0].anchor, 'install')
    assert.equal(doc.sections[0].headingLevel, 2)
    if (doc.sections.length > 1) {
      assert.equal(doc.sections[1].headingLevel, null)
      assert.equal(doc.sections[1].anchor, null)
      assert.equal(
        doc.sections[1].sourceUrl,
        `https://github.com/acme/app/blob/${SOURCE.commitSha}/README.md`
      )
    }
  })
})

import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root, Content } from 'mdast'
import { parse } from '@/lib/parser'
import {
  narrateMermaid,
  narrateCode,
  narrateImage,
  isUsefulAlt,
  isBadgeUrl,
  htmlToSpeakable,
  nodesToSpeakable,
} from '@/lib/speakable'

function mdNodes(markdown: string): Content[] {
  const tree = unified().use(remarkParse).parse(markdown) as Root
  return tree.children as Content[]
}

describe('narrateMermaid', () => {
  it('summarizes a flowchart without reading raw syntax', () => {
    const result = narrateMermaid(`flowchart TD
  A[Start] --> B[Process]
  B --> C[Finish]`)
    expect(result.kind).toBe('flowchart')
    expect(result.text).toMatch(/flowchart/i)
    expect(result.text).toMatch(/Start/)
    expect(result.text).toMatch(/Process/)
    expect(result.text).toMatch(/Finish/)
    expect(result.text).not.toMatch(/flowchart TD/)
    expect(result.text).not.toMatch(/-->/)
  })

  it('summarizes a sequence diagram', () => {
    const result = narrateMermaid(`sequenceDiagram
  participant Alice
  participant Bob
  Alice->>Bob: Hello
  Bob-->>Alice: Hi`)
    expect(result.kind).toBe('sequence')
    expect(result.text).toMatch(/sequence/i)
    expect(result.text).toMatch(/Alice/)
    expect(result.text).toMatch(/Bob/)
    expect(result.text).toMatch(/Hello/)
  })

  it('falls back safely for empty diagrams', () => {
    expect(narrateMermaid('').text).toMatch(/empty/i)
    expect(narrateMermaid('flowchart TD\n%% only comment').text).toMatch(/empty|could not/i)
  })

  it('falls back without inventing edges for invalid diagrams', () => {
    const result = narrateMermaid('not really mermaid {{{')
    expect(result.text).toMatch(/could not be summarized safely/i)
    expect(result.text).not.toMatch(/leads to/)
  })

  it('prefers specific Mermaid node shapes over generic brackets', () => {
    const result = narrateMermaid(`flowchart TD
  A([Start]) --> B[[Subroutine]]
  B --> C{Decision}
  C --> D[Process]
  D --> E(Rounded)
`)
    expect(result.text).toMatch(/\bStart\b/)
    expect(result.text).toMatch(/\bSubroutine\b/)
    expect(result.text).toMatch(/\bDecision\b/)
    expect(result.text).toMatch(/\bProcess\b/)
    expect(result.text).toMatch(/\bRounded\b/)
    expect(result.text).not.toMatch(/\[Start\]|\(\[|\[\[|\{Decision\}|\[Process\]|\(Rounded\)/)
  })
})

describe('narrateCode', () => {
  it('describes JavaScript without reading line by line', () => {
    const text = narrateCode(
      'javascript',
      `// Fetch the document
export async function fetchContent(url) {
  return fetch(url).then((r) => r.text())
}`
    )
    expect(text).toMatch(/JavaScript/i)
    expect(text).toMatch(/fetchContent|Fetch the document/)
    expect(text).not.toMatch(/export async function/)
  })

  it('describes TypeScript and Python', () => {
    expect(narrateCode('typescript', 'export function greet(name: string) { return name }')).toMatch(
      /TypeScript/i
    )
    expect(narrateCode('python', 'def greet(name):\n    return name')).toMatch(/Python/i)
  })

  it('handles missing language, empty, short, and long blocks', () => {
    expect(narrateCode(null, 'x = 1')).toMatch(/short code snippet/i)
    expect(narrateCode('js', '')).toMatch(/empty/i)
    expect(narrateCode(undefined, 'const a = 1')).toMatch(/short/i)
    const long = Array.from({ length: 50 }, (_, i) => `const v${i} = ${i}`).join('\n')
    expect(narrateCode('js', long)).toMatch(/longer|JavaScript/i)
  })

  it('mentions shell commands when present', () => {
    expect(narrateCode('bash', 'npm install\nnpm run build')).toMatch(/npm install/i)
  })
})

describe('images and badges', () => {
  it('narrates useful alt text', () => {
    expect(narrateImage('Architecture diagram showing the application flow', './a.png')).toMatch(
      /Architecture diagram/
    )
  })

  it('omits missing, empty, URL-only, and filename-only alts', () => {
    expect(narrateImage(null, './a.png')).toBeNull()
    expect(narrateImage('', './a.png')).toBeNull()
    expect(narrateImage('https://example.com/a.png', 'https://example.com/a.png')).toBeNull()
    expect(narrateImage('diagram.png', './diagram.png')).toBeNull()
    expect(isUsefulAlt('diagram.png')).toBe(false)
  })

  it('detects badge hosts and summarizes badge alts', () => {
    expect(isBadgeUrl('https://img.shields.io/badge/TypeScript-5%2B-blue')).toBe(true)
    expect(
      narrateImage('TypeScript 5+', 'https://img.shields.io/badge/TypeScript-5%2B-blue')
    ).toMatch(/Badge: TypeScript/)
  })

  it('collapses consecutive badges in a paragraph', async () => {
    const sections = await parse(`# Badges

![TypeScript 5+](https://img.shields.io/badge/TypeScript-5%2B-blue) ![Next.js](https://img.shields.io/badge/Next.js-16-black)

Some prose.
`)
    const text = sections.map((s) => s.text).join(' ')
    expect(text).toMatch(/badges for/i)
    expect(text).toMatch(/TypeScript/)
    expect(text).toMatch(/Next\.js|Next/)
    expect(text).not.toMatch(/shields\.io/)
  })
})

describe('htmlToSpeakable', () => {
  it('keeps visible text and drops tags, scripts, styles, and attributes', () => {
    expect(htmlToSpeakable('<p class="x" id="y">Hello <strong>world</strong></p>')).toBe(
      'Hello world'
    )
    expect(htmlToSpeakable('<script>alert(1)</script><p>Safe</p>')).toBe('Safe')
    expect(htmlToSpeakable('<style>.x{}</style><div>Visible</div>')).toBe('Visible')
  })

  it('does not leak attribute text when attributes contain >', () => {
    expect(htmlToSpeakable('<div title="2 > 1">Visible</div>')).toBe('Visible')
    expect(htmlToSpeakable("<div title='a > b'>Only</div>")).toBe('Only')
    expect(
      htmlToSpeakable('<a href="https://example.com?x=1&y=2" class="btn primary">Click</a>')
    ).toBe('Click')
    expect(htmlToSpeakable('<div title="2 > 1">Visible</div>')).not.toMatch(/>|title=/)
  })

  it('handles nested tags, entities, noscript/template, and malformed HTML', () => {
    expect(htmlToSpeakable('<div><p>Outer <em>inner</em></p></div>')).toBe('Outer inner')
    expect(htmlToSpeakable('<p>Tom &amp; Jerry &lt;3</p>')).toMatch(/Tom & Jerry/)
    expect(htmlToSpeakable('<noscript>Hidden</noscript><p>Shown</p>')).toBe('Shown')
    expect(htmlToSpeakable('<template><p>Nope</p></template><span>Yes</span>')).toBe('Yes')
    // Malformed: parser recovers without speaking attribute fragments
    expect(htmlToSpeakable('<div title="oops>still">Recovered</div>')).toBe('Recovered')
  })

  it('handles inline HTML mixed with markdown via the parser', async () => {
    const sections = await parse(`# Mixed

Hello <em>there</em> from HTML.

<script>shouldNotSpeak()</script>
`)
    expect(sections[0].text).toMatch(/Hello there from HTML/)
    expect(sections[0].text).not.toMatch(/shouldNotSpeak|script/i)
  })
})

describe('nodesToSpeakable integration', () => {
  it('does not read mermaid or code fences literally', () => {
    const text = nodesToSpeakable(
      mdNodes(`\`\`\`mermaid
flowchart LR
  A[Input] --> B[Output]
\`\`\`

\`\`\`ts
export function add(a: number, b: number) { return a + b }
\`\`\`
`)
    )
    expect(text).toMatch(/flowchart|diagram/i)
    expect(text).toMatch(/TypeScript|add/)
    expect(text).not.toMatch(/flowchart LR/)
    expect(text).not.toMatch(/export function add/)
  })

  it('preserves ordinary prose and section order with source metadata', async () => {
    const sections = await parse(
      `Intro paragraph before headings.

## Setup

Install the app.

## Diagram

\`\`\`mermaid
flowchart TD
  A[Clone] --> B[Install]
\`\`\`
`,
      {
        source: {
          url: 'https://github.com/acme/app',
          repo: 'acme/app',
          ref: 'main',
          commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          path: 'README.md',
        },
      }
    )
    expect(sections[0].title).toBe('Introduction')
    expect(sections[0].anchor).toBeNull()
    expect(sections[1].anchor).toBe('setup')
    expect(sections[2].anchor).toBe('diagram')
    expect(sections[2].text).toMatch(/Clone/)
    expect(sections[2].sourceUrl).toContain('#diagram')
    expect(sections.map((s) => s.title)).toEqual(['Introduction', 'Setup', 'Diagram'])
  })

  it('leaves plain READMEs working without special blocks', async () => {
    const sections = await parse(`# Hello

This is a simple project.

## Usage

Run the server.
`)
    expect(sections[0].text).toMatch(/simple project/)
    expect(sections[1].text).toMatch(/Run the server/)
  })
})

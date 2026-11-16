import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  narrateMermaid,
  narrateCode,
  narrateImage,
  narrateBadgeGroup,
  isUsefulAlt,
  isBadgeUrl,
  htmlToSpeakable,
  rewriteMarkdownSpeakable,
} from './speakable.mjs';

describe('narrateMermaid', () => {
  it('summarizes flowcharts without raw syntax', () => {
    const r = narrateMermaid(`flowchart TD
  A[Start] --> B[Process]
  B --> C[Finish]`);
    assert.match(r.text, /flowchart/i);
    assert.match(r.text, /Start/);
    assert.match(r.text, /Finish/);
    assert.doesNotMatch(r.text, /-->/);
  });

  it('summarizes sequence diagrams', () => {
    const r = narrateMermaid(`sequenceDiagram
  participant Alice
  Alice->>Bob: Hello`);
    assert.match(r.text, /sequence/i);
    assert.match(r.text, /Alice/);
    assert.match(r.text, /Hello/);
  });

  it('handles empty and invalid diagrams safely', () => {
    assert.match(narrateMermaid('').text, /empty/i);
    assert.match(narrateMermaid('???').text, /could not be summarized safely/i);
  });

  it('prefers specific node shapes', () => {
    const r = narrateMermaid(`flowchart TD
  A([Start]) --> B[[Subroutine]]
  B --> C{Decision}
  C --> D[Process]
  D --> E(Rounded)`);
    assert.match(r.text, /\bStart\b/);
    assert.match(r.text, /\bSubroutine\b/);
    assert.match(r.text, /\bDecision\b/);
    assert.match(r.text, /\bProcess\b/);
    assert.match(r.text, /\bRounded\b/);
  });
});

describe('narrateCode', () => {
  it('summarizes JS/TS/Python without line-by-line reading', () => {
    assert.match(
      narrateCode('javascript', '// Fetch docs\nexport async function fetchContent() {}'),
      /JavaScript/
    );
    assert.match(narrateCode('typescript', 'export function add(a: number) { return a }'), /TypeScript/);
    assert.match(narrateCode('python', 'def greet(name):\n    return name'), /Python/);
    assert.doesNotMatch(
      narrateCode('js', 'export async function fetchContent() { return 1 }'),
      /export async function/
    );
  });

  it('handles empty, short, and unlabeled blocks', () => {
    assert.match(narrateCode('js', ''), /empty/i);
    assert.match(narrateCode(null, 'x = 1'), /short code snippet/i);
  });
});

describe('images and badges', () => {
  it('uses useful alt and omits useless alts', () => {
    assert.match(
      narrateImage('Architecture diagram showing the application flow', './a.png'),
      /Architecture/
    );
    assert.equal(narrateImage('', './a.png'), null);
    assert.equal(isUsefulAlt('diagram.png'), false);
  });

  it('groups badges without speaking URLs', () => {
    assert.equal(isBadgeUrl('https://img.shields.io/badge/TypeScript-5%2B-blue'), true);
    const group = narrateBadgeGroup(['TypeScript 5+', 'Next.js']);
    assert.match(group, /badges for/i);
    assert.doesNotMatch(group, /shields\.io/);
  });
});

describe('htmlToSpeakable', () => {
  it('extracts visible text without attributes or scripts', () => {
    assert.equal(htmlToSpeakable('<div title="2 > 1">Visible</div>'), 'Visible');
    assert.equal(htmlToSpeakable("<div title='a > b'>Only</div>"), 'Only');
    assert.equal(htmlToSpeakable('<script>alert(1)</script><p>Safe</p>'), 'Safe');
    assert.equal(htmlToSpeakable('<style>.x{}</style><span>Hi</span>'), 'Hi');
  });

  it('decodes entities only once', () => {
    assert.equal(htmlToSpeakable('<p>&amp;amp;</p>'), '&amp;');
    assert.equal(htmlToSpeakable('<p>&amp;</p>'), '&');
    assert.equal(htmlToSpeakable('<p>&lt;tag&gt;</p>'), '<tag>');
    assert.equal(htmlToSpeakable('<p>&#38;#38;</p>'), '&#38;');
  });
});

describe('rewriteMarkdownSpeakable', () => {
  it('rewrites mermaid, code, images, badges, and html together', () => {
    const md = `# Demo

![TypeScript 5+](https://img.shields.io/badge/TypeScript-5%2B-blue) ![Next.js](https://img.shields.io/badge/Next.js-16-black)

![Architecture diagram showing the flow](./arch.png)

\`\`\`mermaid
flowchart LR
  A[Input] --> B[Output]
\`\`\`

\`\`\`ts
export function add(a: number, b: number) { return a + b }
\`\`\`

<div title="2 > 1">Visible HTML</div>
`;
    const out = rewriteMarkdownSpeakable(md);
    assert.match(out, /^# Demo/m);
    assert.match(out, /badges for|badge/i);
    assert.match(out, /Architecture diagram/);
    assert.match(out, /flowchart|diagram/i);
    assert.match(out, /TypeScript/);
    assert.match(out, /Visible HTML/);
    assert.doesNotMatch(out, /flowchart LR/);
    assert.doesNotMatch(out, /export function add/);
    assert.doesNotMatch(out, /shields\.io/);
    assert.doesNotMatch(out, /title=/);
  });

  it('protects HTML inside fenced code from document HTML stripping', () => {
    const md = `# Examples

\`\`\`html
<script>alert("example")</script>
<div>Example</div>
\`\`\`

\`\`\`js
const html = '<div title="2 > 1">Safe</div>';
if (x < 5) console.log(html);
\`\`\`
`;
    const out = rewriteMarkdownSpeakable(md);
    // Fenced HTML/JS must reach narrateCode (short → snippet), not be wiped as document HTML
    assert.match(out, /short HTML snippet/i);
    assert.match(out, /short JavaScript snippet/i);
    assert.doesNotMatch(out, /<script>/i);
    assert.doesNotMatch(out, /<div>/i);
  });

  it('preserves comparison operators in prose and strips real tags', () => {
    const out = rewriteMarkdownSpeakable(
      `# Compare\n\nUse x < 5 and a > b when filtering.\n\n<div title="2 > 1">Keep me</div>\n`
    );
    assert.match(out, /x < 5/);
    assert.match(out, /a > b/);
    assert.match(out, /Keep me/);
    assert.doesNotMatch(out, /title=/);
  });

  it('preserves plain prose READMEs', () => {
    const out = rewriteMarkdownSpeakable(`# Hello\n\nSimple project.\n`);
    assert.match(out, /Simple project/);
  });
});

describe('htmlToSpeakable comparisons', () => {
  it('does not treat x < 5 as a tag', () => {
    assert.equal(htmlToSpeakable('Use x < 5 and a > b.'), 'Use x < 5 and a > b.');
  });

  it('does not treat TypeScript-like generics as tags', () => {
    assert.equal(htmlToSpeakable('Returns Foo<T> and Bar<U, V>.'), 'Returns Foo<T> and Bar<U, V>.');
  });

  it('preserves incomplete tags that never close', () => {
    assert.equal(htmlToSpeakable('Ends with <div'), 'Ends with <div');
    assert.equal(htmlToSpeakable('texto normal <div'), 'texto normal <div');
  });

  it('still extracts content from complete tags and custom elements', () => {
    assert.equal(htmlToSpeakable('<div>contenido</div>'), 'contenido');
    assert.equal(htmlToSpeakable('<my-widget>contenido</my-widget>'), 'contenido');
  });
});

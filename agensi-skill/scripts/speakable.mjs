/**
 * Deterministic speakable narration helpers for DocuVoice Agensi skill.
 * Port of docuvoice/lib/speakable.ts — zero npm dependencies.
 *
 * CLI:
 *   node speakable.mjs --rewrite <input.md> [--out <file>]
 *   node speakable.mjs --help
 *
 * Does not execute README code or HTML/JS. No LLM calls.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BADGE_HOST_RE =
  /(?:^|\.)(?:shields\.io|badge\.fury\.io|badgen\.net|img\.shields\.io)|github\.com\/[^/]+\/[^/]+\/(?:actions\/)?workflows\/|github\.com\/[^/]+\/[^/]+\/badge/i;

const FILE_OR_URL_ALT_RE =
  /^(?:https?:\/\/\S+|\/?\S+\.(?:png|jpe?g|gif|svg|webp|ico)(?:\?\S*)?)$/i;

const LANG_NAMES = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  ruby: 'Ruby',
  go: 'Go',
  rs: 'Rust',
  rust: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  kotlin: 'Kotlin',
  cs: 'C Sharp',
  csharp: 'C Sharp',
  cpp: 'C Plus Plus',
  c: 'C',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  shell: 'shell',
  powershell: 'PowerShell',
  ps1: 'PowerShell',
  sql: 'SQL',
  yaml: 'YAML',
  yml: 'YAML',
  json: 'JSON',
  toml: 'TOML',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  md: 'Markdown',
  markdown: 'Markdown',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  graphql: 'GraphQL',
  php: 'PHP',
  swift: 'Swift',
};

const HIDDEN_HTML_TAGS = new Set(['script', 'style', 'noscript', 'template']);

const USAGE = `Usage:
  node speakable.mjs --rewrite <input.md> [--out <file>]

Rewrites Mermaid fences, code fences, images/badges, and HTML in Markdown into
podcast-ready prose. Zero dependencies. Does not call LLMs or network APIs.`;

function collapseWhitespace(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function uniquePreserve(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = String(item).toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function joinList(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function stripMermaidQuotes(label) {
  return String(label).replace(/^["']|["']$/g, '').trim();
}

function languageLabel(lang) {
  if (!lang) return null;
  const key = String(lang).trim().toLowerCase().split(/[\s{]/)[0] || '';
  if (!key || key === 'mermaid') return null;
  return LANG_NAMES[key] ?? key;
}

/** Decode a single HTML entity / numeric reference once. */
function decodeHtmlEntity(entity) {
  if (entity === '&amp;') return '&';
  if (entity === '&lt;') return '<';
  if (entity === '&gt;') return '>';
  if (entity === '&quot;') return '"';
  if (entity === '&apos;' || entity === '&#39;') return "'";
  if (entity === '&nbsp;') return ' ';
  const dec = entity.match(/^&#(\d+);$/);
  if (dec) return String.fromCodePoint(Number(dec[1]));
  const hex = entity.match(/^&#x([0-9a-f]+);$/i);
  if (hex) return String.fromCodePoint(parseInt(hex[1], 16));
  return entity;
}

function decodeHtmlText(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m) => decodeHtmlEntity(m));
}

export function isUsefulAlt(alt, url) {
  const value = (alt ?? '').trim();
  if (!value) return false;
  if (FILE_OR_URL_ALT_RE.test(value)) return false;
  if (url && value === String(url).trim()) return false;
  if (/^[\w.-]+\.(png|jpe?g|gif|svg|webp|ico)$/i.test(value)) return false;
  return true;
}

export function isBadgeUrl(url) {
  if (!url) return false;
  const hostPath = String(url).replace(/^https?:\/\//i, '');
  return BADGE_HOST_RE.test(hostPath) || /\/badge(?:[/?]|$)/i.test(url);
}

// ─── Mermaid ──────────────────────────────────────────────────────────────────

export function narrateMermaid(source) {
  const raw = String(source).replace(/\r\n/g, '\n').trim();
  if (!raw) return { text: 'This section includes an empty diagram.', kind: 'unknown' };

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));
  if (lines.length === 0) return { text: 'This section includes an empty diagram.', kind: 'unknown' };

  const header = lines[0].toLowerCase();
  let kind = 'unknown';
  if (/^(flowchart|graph)\b/.test(header)) kind = 'flowchart';
  else if (/^sequencediagram\b/.test(header)) kind = 'sequence';
  else if (/^classdiagram\b/.test(header)) kind = 'class';
  else if (/^statediagram/.test(header)) kind = 'state';
  else if (/^erdiagram\b/.test(header)) kind = 'er';
  else if (/^gantt\b/.test(header)) kind = 'gantt';
  else if (/^pie\b/.test(header)) kind = 'pie';

  const body = kind === 'unknown' ? lines : lines.slice(1);

  if (kind === 'sequence') {
    const participants = [];
    const messages = [];
    for (const line of body) {
      const part = line.match(/^(?:participant|actor)\s+(\w+)(?:\s+as\s+(.+))?/i);
      if (part) {
        participants.push(stripMermaidQuotes(part[2] ?? part[1]));
        continue;
      }
      const msg = line.match(/^(\w+)\s*(-->>|->>|-->|->|--x|-\)|-\.>|==>)\s*(\w+)\s*:\s*(.+)$/);
      if (msg) {
        messages.push(`${msg[1]} to ${msg[3]}: ${stripMermaidQuotes(msg[4])}`);
        participants.push(msg[1], msg[3]);
      }
    }
    const people = uniquePreserve(participants);
    if (messages.length === 0 && people.length === 0) {
      return {
        text: 'This section includes a sequence diagram that could not be summarized safely.',
        kind,
      };
    }
    const who = people.length ? ` involving ${joinList(people.slice(0, 6))}` : '';
    const flow = messages.length ? ` The main exchanges are: ${messages.slice(0, 5).join('; ')}.` : '';
    return {
      text: collapseWhitespace(`This sequence diagram shows interactions${who}.${flow}`),
      kind,
    };
  }

  const nodeLabels = new Map();
  const edgeDescs = [];
  // stadium → subroutine → rectangle → rounded → diamond
  const nodeDefRe =
    /\b([A-Za-z][\w]*)\s*(?:\(\[([^\]]*)\]\)|\[\[([^\]]*)\]\]|\[([^\]]*)\]|\(([^\)]*)\)|\{([^\}]*)\})/g;
  const edgeRe =
    /\b([A-Za-z][\w]*)\s*(?:-->|---|==>|-.->|==>|-->>|==)\s*(?:\|([^|]+)\|)?\s*([A-Za-z][\w]*)/g;

  for (const line of body) {
    let m;
    nodeDefRe.lastIndex = 0;
    while ((m = nodeDefRe.exec(line)) !== null) {
      const id = m[1];
      const label = stripMermaidQuotes(m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? id);
      if (label) nodeLabels.set(id, label);
    }
    edgeRe.lastIndex = 0;
    while ((m = edgeRe.exec(line)) !== null) {
      const fromId = m[1];
      const toId = m[3];
      const edgeLabel = m[2] ? stripMermaidQuotes(m[2]) : '';
      if (!nodeLabels.has(fromId)) nodeLabels.set(fromId, fromId);
      if (!nodeLabels.has(toId)) nodeLabels.set(toId, toId);
      const from = nodeLabels.get(fromId) ?? fromId;
      const to = nodeLabels.get(toId) ?? toId;
      edgeDescs.push(edgeLabel ? `${from} leads to ${to} (${edgeLabel})` : `${from} leads to ${to}`);
    }
  }

  const nodes = uniquePreserve([...nodeLabels.values()]);
  if (nodes.length === 0 && edgeDescs.length === 0) {
    return {
      text: 'This section includes a diagram that could not be summarized safely.',
      kind,
    };
  }

  const kindPhrase =
    kind === 'flowchart'
      ? 'flowchart'
      : kind === 'class'
        ? 'class diagram'
        : kind === 'state'
          ? 'state diagram'
          : kind === 'er'
            ? 'entity relationship diagram'
            : kind === 'gantt'
              ? 'gantt chart'
              : kind === 'pie'
                ? 'pie chart'
                : 'diagram';

  const parts = [];
  if (nodes.length > 0) {
    parts.push(
      `This ${kindPhrase} shows ${joinList(nodes.slice(0, 8))}${nodes.length > 8 ? ', among other elements' : ''}.`
    );
  } else {
    parts.push(`This ${kindPhrase} illustrates a process.`);
  }
  if (edgeDescs.length > 0) parts.push(`The flow is: ${edgeDescs.slice(0, 6).join('; ')}.`);
  return { text: collapseWhitespace(parts.join(' ')), kind };
}

// ─── Code ─────────────────────────────────────────────────────────────────────

function extractCodeHints(source) {
  const hints = [];
  const lines = source.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 40)) {
    const comment =
      line.match(/^\/\/\s*(.+)$/) ||
      line.match(/^#\s*(.+)$/) ||
      line.match(/^\/\*\s*(.+?)\s*\*\/$/) ||
      line.match(/^"""\s*(.+?)\s*"""$/);
    if (comment?.[1] && !/^[=*-]{3,}/.test(comment[1])) {
      hints.push(comment[1].replace(/\.*$/, ''));
      if (hints.length >= 2) break;
    }
  }

  const names = [];
  const patterns = [
    /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)/g,
    /\b(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_]\w*)/g,
    /\bdef\s+([A-Za-z_]\w*)/g,
    /\bconst\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) {
      names.push(m[1]);
      if (names.length >= 3) break;
    }
    if (names.length >= 3) break;
  }

  const cmds = source.match(/\b(?:npm|pnpm|yarn|npx|pip|cargo|docker|kubectl|git)\s+[^\n|;]+/gi);
  if (cmds) {
    for (const cmd of cmds.slice(0, 2)) hints.push(`it runs ${collapseWhitespace(cmd)}`);
  }
  if (names.length) hints.push(`it defines ${joinList(uniquePreserve(names).slice(0, 3))}`);
  return uniquePreserve(hints).slice(0, 3);
}

export function narrateCode(lang, source) {
  const body = String(source).replace(/\r\n/g, '\n').trim();
  if (!body) return 'This section includes an empty code block.';

  const label = languageLabel(lang);
  const lineCount = body.split('\n').filter((l) => l.trim()).length;
  const hints = extractCodeHints(body);

  if (lineCount <= 2 && body.length < 80 && hints.length === 0) {
    return label
      ? `This section includes a short ${label} snippet.`
      : 'This section includes a short code snippet.';
  }

  const opener = label
    ? `This section includes a ${label} code example`
    : 'This section includes a code example';

  if (hints.length === 0) {
    return lineCount > 40 ? `${opener} covering a longer routine.` : `${opener}.`;
  }

  const detail = hints
    .map((h) => (h.startsWith('it ') ? h : h.charAt(0).toLowerCase() + h.slice(1)))
    .join(', and ');
  return collapseWhitespace(`${opener} — ${detail}.`);
}

// ─── Images & badges ──────────────────────────────────────────────────────────

export function narrateImage(alt, url) {
  if (isBadgeUrl(url)) {
    if (!isUsefulAlt(alt, url)) return null;
    return `Badge: ${collapseWhitespace(alt)}.`;
  }
  if (!isUsefulAlt(alt, url)) return null;
  return `Image: ${collapseWhitespace(alt)}.`;
}

export function narrateBadgeGroup(labels) {
  const clean = uniquePreserve(labels.map(collapseWhitespace).filter(Boolean)).slice(0, 8);
  if (clean.length === 0) return null;
  if (clean.length === 1) return `This section includes a ${clean[0]} badge.`;
  return `This section includes badges for ${joinList(clean)}.`;
}

// ─── HTML (attribute-aware scanner — not naive tag regex) ─────────────────────

/**
 * Extract visible text from HTML with a small state machine.
 * Skips attributes entirely; skips script/style/noscript/template bodies;
 * decodes entities once in text nodes only.
 */
export function htmlToSpeakable(html) {
  if (!html || !String(html).trim()) return '';
  const s = String(html);
  let i = 0;
  let out = '';
  let skipDepth = 0; // nested hidden tags
  let skipTag = null;

  const startsWith = (word) => s.slice(i, i + word.length).toLowerCase() === word;

  while (i < s.length) {
    if (s[i] === '<' && i + 1 < s.length) {
      // Comment
      if (s.startsWith('<!--', i)) {
        const end = s.indexOf('-->', i + 4);
        i = end === -1 ? s.length : end + 3;
        continue;
      }

      const isClose = s[i + 1] === '/';
      let j = i + (isClose ? 2 : 1);
      while (j < s.length && /[A-Za-z0-9:-]/.test(s[j])) j += 1;
      const tagName = s.slice(i + (isClose ? 2 : 1), j).toLowerCase();

      // Scan to end of tag without emitting attributes
      let quote = null;
      while (j < s.length) {
        const ch = s[j];
        if (quote) {
          if (ch === quote) quote = null;
          j += 1;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          j += 1;
          continue;
        }
        if (ch === '>') {
          j += 1;
          break;
        }
        j += 1;
      }

      if (HIDDEN_HTML_TAGS.has(tagName)) {
        if (isClose) {
          if (skipTag === tagName && skipDepth > 0) {
            skipDepth -= 1;
            if (skipDepth === 0) skipTag = null;
          }
        } else {
          // self-closing?
          const rawTag = s.slice(i, j);
          if (!/\/\s*>$/.test(rawTag)) {
            if (!skipTag) {
              skipTag = tagName;
              skipDepth = 1;
            } else if (skipTag === tagName) {
              skipDepth += 1;
            }
          }
        }
      } else if (tagName === 'br' || tagName === 'hr') {
        if (skipDepth === 0) out += ' ';
      }

      i = j;
      continue;
    }

    if (skipDepth > 0) {
      i += 1;
      continue;
    }

    // Text run until next '<'
    let k = i;
    while (k < s.length && s[k] !== '<') k += 1;
    out += decodeHtmlText(s.slice(i, k));
    i = k;
  }

  return collapseWhitespace(out);
}

// ─── Markdown rewrite ─────────────────────────────────────────────────────────

function replaceFencedBlocks(markdown) {
  return markdown.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, info, body) => {
    const lang = String(info || '').trim().split(/\s+/)[0] || '';
    if (lang.toLowerCase() === 'mermaid') {
      return `\n${narrateMermaid(body).text}\n`;
    }
    return `\n${narrateCode(lang || null, body)}\n`;
  });
}

function replaceImagesAndBadges(markdown) {
  // Linked badges: [![alt](badgeUrl)](href)
  let text = markdown.replace(
    /\[!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_m, alt, imgUrl) => {
      if (isBadgeUrl(imgUrl)) {
        return isUsefulAlt(alt, imgUrl) ? ` ${alt} ` : ' ';
      }
      const spoken = narrateImage(alt, imgUrl);
      return spoken ? ` ${spoken} ` : ' ';
    }
  );

  // Collect consecutive badge alts into groups after a pass that marks badges
  const badgeAlts = [];
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt, url) => {
    if (isBadgeUrl(url)) {
      if (isUsefulAlt(alt, url)) badgeAlts.push(alt);
      return '\0BADGE\0';
    }
    const spoken = narrateImage(alt, url);
    return spoken ? ` ${spoken} ` : ' ';
  });

  // Collapse runs of badge placeholders
  text = text.replace(/(?:\0BADGE\0|\s)+/g, (run) => {
    if (!run.includes('\0BADGE\0')) return run;
    const count = (run.match(/\0BADGE\0/g) || []).length;
    const labels = badgeAlts.splice(0, count);
    const spoken = narrateBadgeGroup(labels);
    return spoken ? ` ${spoken} ` : ' ';
  });

  return text;
}

/** Remove HTML tags with quote-aware scanning (never splits on `>` inside attributes). */
function stripHtmlTagsAttributeAware(input) {
  const s = String(input);
  let i = 0;
  let out = '';
  while (i < s.length) {
    if (s[i] === '<' && i + 1 < s.length) {
      if (s.startsWith('<!--', i)) {
        const end = s.indexOf('-->', i + 4);
        i = end === -1 ? s.length : end + 3;
        out += ' ';
        continue;
      }
      let j = i + 1;
      let quote = null;
      while (j < s.length) {
        const ch = s[j];
        if (quote) {
          if (ch === quote) quote = null;
          j += 1;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          j += 1;
          continue;
        }
        if (ch === '>') {
          j += 1;
          break;
        }
        j += 1;
      }
      out += ' ';
      i = j;
      continue;
    }
    out += s[i];
    i += 1;
  }
  return out;
}

/**
 * Rewrite a Markdown document so Mermaid/code/images/badges/HTML become speakable prose.
 * Heading structure is preserved for later classification by the agent.
 */
export function rewriteMarkdownSpeakable(markdown) {
  let text = String(markdown).replace(/\r\n/g, '\n');
  // HTML elements → visible text (attribute-safe via htmlToSpeakable)
  text = text.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ');
  text = text.replace(
    /<(p|div|span|section|article|li|td|th|h[1-6]|em|strong|b|i|a)\b[\s\S]*?<\/\1>/gi,
    (block) => {
      const spoken = htmlToSpeakable(block);
      return spoken ? ` ${spoken} ` : ' ';
    }
  );
  // Stray tags (quote-aware; does not treat `>` inside attributes as tag end)
  text = stripHtmlTagsAttributeAware(text);
  text = replaceFencedBlocks(text);
  text = replaceImagesAndBadges(text);
  return `${text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { help: false, rewrite: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--rewrite') args.rewrite = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (!a.startsWith('-') && !args.rewrite) args.rewrite = a;
    else throw new Error(`Unknown argument: ${a}\n\n${USAGE}`);
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.rewrite) {
    console.log(USAGE);
    return;
  }
  const inputPath = path.resolve(args.rewrite);
  const raw = await fs.readFile(inputPath, 'utf8');
  const rewritten = rewriteMarkdownSpeakable(raw);
  if (args.out) {
    const outPath = path.resolve(args.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, rewritten, 'utf8');
    console.log(`Wrote: ${outPath}`);
  } else {
    process.stdout.write(rewritten);
  }
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  });
}

export { collapseWhitespace, replaceFencedBlocks };

import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import { toText } from 'hast-util-to-text'
import type { Root as HastRoot, Element as HastElement, Nodes as HastNodes } from 'hast'
import type { Content, Root, PhrasingContent, Code, Image, Html, Link, Paragraph } from 'mdast'

const BADGE_HOST_RE =
  /(?:^|\.)(?:shields\.io|badge\.fury\.io|badgen\.net|img\.shields\.io)|github\.com\/[^/]+\/[^/]+\/(?:actions\/)?workflows\/|github\.com\/[^/]+\/[^/]+\/badge/i

const FILE_OR_URL_ALT_RE =
  /^(?:https?:\/\/\S+|\/?\S+\.(?:png|jpe?g|gif|svg|webp|ico)(?:\?\S*)?)$/i

const LANG_NAMES: Record<string, string> = {
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
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/** True when alt is worth speaking (not empty, not a bare URL/filename). */
export function isUsefulAlt(alt: string | null | undefined, url?: string | null): boolean {
  const value = (alt ?? '').trim()
  if (!value) return false
  if (FILE_OR_URL_ALT_RE.test(value)) return false
  if (url && value === url.trim()) return false
  // Single token that looks like a path segment only
  if (/^[\w.-]+\.(png|jpe?g|gif|svg|webp|ico)$/i.test(value)) return false
  return true
}

export function isBadgeUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const hostPath = url.replace(/^https?:\/\//i, '')
    return BADGE_HOST_RE.test(hostPath) || /\/badge(?:[/?]|$)/i.test(url)
  } catch {
    return false
  }
}

function languageLabel(lang: string | null | undefined): string | null {
  if (!lang) return null
  const key = lang.trim().toLowerCase().split(/[\s{]/)[0] ?? ''
  if (!key || key === 'mermaid') return null
  return LANG_NAMES[key] ?? key
}

// ─── Mermaid ──────────────────────────────────────────────────────────────────

export interface MermaidNarration {
  text: string
  kind: 'flowchart' | 'sequence' | 'class' | 'state' | 'er' | 'gantt' | 'pie' | 'unknown'
}

function uniquePreserve(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = item.toLowerCase()
    if (!item || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function stripMermaidQuotes(label: string): string {
  return label.replace(/^["']|["']$/g, '').trim()
}

/**
 * Deterministic Mermaid → speakable summary. Never invents edges that are not present.
 */
export function narrateMermaid(source: string): MermaidNarration {
  const raw = source.replace(/\r\n/g, '\n').trim()
  if (!raw) {
    return { text: 'This section includes an empty diagram.', kind: 'unknown' }
  }

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'))

  if (lines.length === 0) {
    return { text: 'This section includes an empty diagram.', kind: 'unknown' }
  }

  const header = lines[0].toLowerCase()
  let kind: MermaidNarration['kind'] = 'unknown'
  if (/^(flowchart|graph)\b/.test(header)) kind = 'flowchart'
  else if (/^sequencediagram\b/.test(header)) kind = 'sequence'
  else if (/^classdiagram\b/.test(header)) kind = 'class'
  else if (/^statediagram/.test(header)) kind = 'state'
  else if (/^erdiagram\b/.test(header)) kind = 'er'
  else if (/^gantt\b/.test(header)) kind = 'gantt'
  else if (/^pie\b/.test(header)) kind = 'pie'

  const body = kind === 'unknown' ? lines : lines.slice(1)

  if (kind === 'sequence') {
    const participants: string[] = []
    const messages: string[] = []
    for (const line of body) {
      const part = line.match(/^(?:participant|actor)\s+(\w+)(?:\s+as\s+(.+))?/i)
      if (part) {
        participants.push(stripMermaidQuotes(part[2] ?? part[1]))
        continue
      }
      const msg = line.match(
        /^(\w+)\s*(-->>|->>|-->|->|--x|-\)|-\.>|==>)\s*(\w+)\s*:\s*(.+)$/
      )
      if (msg) {
        const from = msg[1]
        const to = msg[3]
        const text = stripMermaidQuotes(msg[4])
        messages.push(`${from} to ${to}: ${text}`)
        participants.push(from, to)
      }
    }
    const people = uniquePreserve(participants)
    if (messages.length === 0 && people.length === 0) {
      return {
        text: 'This section includes a sequence diagram that could not be summarized safely.',
        kind,
      }
    }
    const who = people.length ? ` involving ${joinList(people.slice(0, 6))}` : ''
    const flow =
      messages.length > 0
        ? ` The main exchanges are: ${messages.slice(0, 5).join('; ')}.`
        : ''
    return {
      text: collapseWhitespace(`This sequence diagram shows interactions${who}.${flow}`),
      kind,
    }
  }

  // Flowchart / generic: collect node labels and explicit edges
  const nodeLabels = new Map<string, string>()
  const edgeDescs: string[] = []

  // Specific shapes before generic ones: stadium ([ ]), subroutine [[ ]],
  // then rectangle [ ], rounded ( ), diamond { }.
  const nodeDefRe =
    /\b([A-Za-z][\w]*)\s*(?:\(\[([^\]]*)\]\)|\[\[([^\]]*)\]\]|\[([^\]]*)\]|\(([^\)]*)\)|\{([^\}]*)\})/g
  const edgeRe =
    /\b([A-Za-z][\w]*)\s*(?:-->|---|==>|-.->|==>|-->>|==)\s*(?:\|([^|]+)\|)?\s*([A-Za-z][\w]*)/g

  for (const line of body) {
    let m: RegExpExecArray | null
    nodeDefRe.lastIndex = 0
    while ((m = nodeDefRe.exec(line)) !== null) {
      const id = m[1]
      // groups: 2=stadium, 3=subroutine, 4=rectangle, 5=rounded, 6=diamond
      const label = stripMermaidQuotes(m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? id)
      if (label) nodeLabels.set(id, label)
    }
    edgeRe.lastIndex = 0
    while ((m = edgeRe.exec(line)) !== null) {
      const fromId = m[1]
      const toId = m[3]
      const edgeLabel = m[2] ? stripMermaidQuotes(m[2]) : ''
      if (!nodeLabels.has(fromId)) nodeLabels.set(fromId, fromId)
      if (!nodeLabels.has(toId)) nodeLabels.set(toId, toId)
      const from = nodeLabels.get(fromId) ?? fromId
      const to = nodeLabels.get(toId) ?? toId
      edgeDescs.push(edgeLabel ? `${from} leads to ${to} (${edgeLabel})` : `${from} leads to ${to}`)
    }
  }

  const nodes = uniquePreserve([...nodeLabels.values()])
  if (nodes.length === 0 && edgeDescs.length === 0) {
    return {
      text: 'This section includes a diagram that could not be summarized safely.',
      kind,
    }
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
                : 'diagram'

  const parts: string[] = []
  if (nodes.length > 0) {
    parts.push(
      `This ${kindPhrase} shows ${joinList(nodes.slice(0, 8))}${nodes.length > 8 ? ', among other elements' : ''}.`
    )
  } else {
    parts.push(`This ${kindPhrase} illustrates a process.`)
  }
  if (edgeDescs.length > 0) {
    parts.push(`The flow is: ${edgeDescs.slice(0, 6).join('; ')}.`)
  }

  return { text: collapseWhitespace(parts.join(' ')), kind }
}

// ─── Code ─────────────────────────────────────────────────────────────────────

function extractCodeHints(source: string, lang: string | null): string[] {
  const hints: string[] = []
  const lines = source.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines.slice(0, 40)) {
    const comment =
      line.match(/^\/\/\s*(.+)$/) ||
      line.match(/^#\s*(.+)$/) ||
      line.match(/^\/\*\s*(.+?)\s*\*\/$/) ||
      line.match(/^"""\s*(.+?)\s*"""$/)
    if (comment && comment[1] && !/^[=*-]{3,}/.test(comment[1])) {
      hints.push(comment[1].replace(/\.*$/, ''))
      if (hints.length >= 2) break
    }
  }

  const names: string[] = []
  const patterns = [
    /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)/g,
    /\b(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_]\w*)/g,
    /\bdef\s+([A-Za-z_]\w*)/g,
    /\bconst\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(/g,
    /\b(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?[\w<>[\]]+\s+([A-Za-z_]\w*)\s*\(/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) {
      names.push(m[1])
      if (names.length >= 3) break
    }
    if (names.length >= 3) break
  }

  const cmds = source.match(
    /\b(?:npm|pnpm|yarn|npx|pip|cargo|docker|kubectl|git)\s+[^\n|;]+/gi
  )
  if (cmds) {
    for (const cmd of cmds.slice(0, 2)) {
      hints.push(`it runs ${collapseWhitespace(cmd)}`)
    }
  }

  if (names.length) {
    hints.push(`it defines ${joinList(uniquePreserve(names).slice(0, 3))}`)
  }

  void lang
  return uniquePreserve(hints).slice(0, 3)
}

/**
 * Deterministic code → 1–3 spoken sentences. Never reads source line by line.
 */
export function narrateCode(lang: string | null | undefined, source: string): string {
  const body = source.replace(/\r\n/g, '\n').trim()
  if (!body) {
    return 'This section includes an empty code block.'
  }

  const label = languageLabel(lang)
  const lineCount = body.split('\n').filter((l) => l.trim()).length
  const hints = extractCodeHints(body, lang ?? null)

  if (lineCount <= 2 && body.length < 80 && hints.length === 0) {
    return label
      ? `This section includes a short ${label} snippet.`
      : 'This section includes a short code snippet.'
  }

  const opener = label
    ? `This section includes a ${label} code example`
    : 'This section includes a code example'

  if (hints.length === 0) {
    if (lineCount > 40) {
      return `${opener} covering a longer routine.`
    }
    return `${opener}.`
  }

  // hints may already be clauses ("it defines X") or free comments
  const detail = hints
    .map((h) => (h.startsWith('it ') ? h : h.charAt(0).toLowerCase() + h.slice(1)))
    .join(', and ')

  return collapseWhitespace(`${opener} — ${detail}.`)
}

// ─── Images & badges ──────────────────────────────────────────────────────────

export function narrateImage(alt: string | null | undefined, url?: string | null): string | null {
  if (isBadgeUrl(url)) {
    if (!isUsefulAlt(alt, url)) return null
    const label = collapseWhitespace(alt!)
    // Avoid "Build status status"
    return `Badge: ${label}.`
  }
  if (!isUsefulAlt(alt, url)) return null
  return `Image: ${collapseWhitespace(alt!)}.`
}

function narrateBadgeGroup(labels: string[]): string | null {
  const clean = uniquePreserve(labels.map(collapseWhitespace).filter(Boolean)).slice(0, 8)
  if (clean.length === 0) return null
  if (clean.length === 1) return `This section includes a ${clean[0]} badge.`
  return `This section includes badges for ${joinList(clean)}.`
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

const HIDDEN_HTML_TAGS = new Set(['script', 'style', 'noscript', 'template'])

/** Remove non-visible elements (and their descendants) from a hast tree. */
function stripHiddenHast(node: HastNodes): void {
  if (!('children' in node) || !Array.isArray(node.children)) return
  const next = []
  for (const child of node.children) {
    if (child.type === 'element') {
      const el = child as HastElement
      if (HIDDEN_HTML_TAGS.has(el.tagName.toLowerCase())) continue
      stripHiddenHast(el)
      next.push(child)
    } else {
      next.push(child)
    }
  }
  node.children = next as typeof node.children
}

/**
 * Extract visible text from HTML via rehype-parse (not tag-stripping regex).
 * Drops script/style/noscript/template content and never speaks attributes.
 */
export function htmlToSpeakable(html: string): string {
  if (!html || !html.trim()) return ''
  try {
    const tree = unified()
      .use(rehypeParse, { fragment: true })
      .parse(html) as HastRoot
    stripHiddenHast(tree)
    // toText walks the AST — attributes are never included
    return collapseWhitespace(decodeEntities(toText(tree)))
  } catch {
    // Malformed input: fail closed to empty rather than leaking markup
    return ''
  }
}

// ─── mdast walk ───────────────────────────────────────────────────────────────

function phrasingToText(nodes: PhrasingContent[]): string {
  const parts: string[] = []
  const badgeLabels: string[] = []

  const flushBadges = () => {
    const spoken = narrateBadgeGroup(badgeLabels.splice(0))
    if (spoken) parts.push(spoken)
  }

  const walk = (list: PhrasingContent[]) => {
    for (const node of list) {
      switch (node.type) {
        case 'text': {
          // Keep badge groups intact across whitespace between badge images
          if (!node.value.trim()) break
          flushBadges()
          parts.push(node.value)
          break
        }
        case 'inlineCode':
          flushBadges()
          parts.push(node.value)
          break
        case 'break':
        case 'footnoteReference':
          break
        case 'emphasis':
        case 'strong':
        case 'delete': {
          flushBadges()
          if ('children' in node && Array.isArray(node.children)) {
            walk(node.children as PhrasingContent[])
          }
          break
        }
        case 'link':
        case 'linkReference': {
          const link = node as Link
          const childImages = (link.children ?? []).filter((c) => c.type === 'image') as Image[]
          if (childImages.length > 0) {
            for (const img of childImages) {
              if (isBadgeUrl(img.url) || isBadgeUrl(link.url)) {
                if (isUsefulAlt(img.alt, img.url)) badgeLabels.push(img.alt!)
              } else {
                flushBadges()
                const spoken = narrateImage(img.alt, img.url)
                if (spoken) parts.push(spoken)
              }
            }
            // Also keep non-image link text if any
            const other = (link.children ?? []).filter((c) => c.type !== 'image')
            if (other.length) {
              flushBadges()
              walk(other as PhrasingContent[])
            }
          } else {
            flushBadges()
            walk((link.children ?? []) as PhrasingContent[])
          }
          break
        }
        case 'image':
        case 'imageReference': {
          const img = node as Image
          if (isBadgeUrl(img.url)) {
            if (isUsefulAlt(img.alt, img.url)) badgeLabels.push(img.alt!)
          } else {
            flushBadges()
            const spoken = narrateImage(img.alt, img.url)
            if (spoken) parts.push(spoken)
          }
          break
        }
        case 'html': {
          flushBadges()
          const spoken = htmlToSpeakable((node as Html).value)
          if (spoken) parts.push(spoken)
          break
        }
        default: {
          flushBadges()
          const anyNode = node as PhrasingContent & { children?: PhrasingContent[]; value?: string }
          if (Array.isArray(anyNode.children)) {
            walk(anyNode.children)
          } else if (typeof anyNode.value === 'string') {
            parts.push(anyNode.value)
          }
        }
      }
    }
  }

  walk(nodes)
  flushBadges()
  return collapseWhitespace(parts.join(' '))
}

function contentToSpeakable(node: Content): string {
  switch (node.type) {
    case 'code': {
      const code = node as Code
      if ((code.lang ?? '').toLowerCase() === 'mermaid') {
        return narrateMermaid(code.value).text
      }
      return narrateCode(code.lang, code.value)
    }
    case 'html':
      return htmlToSpeakable((node as Html).value)
    case 'paragraph':
      return phrasingToText(((node as Paragraph).children ?? []) as PhrasingContent[])
    case 'heading':
      return phrasingToText((node.children ?? []) as PhrasingContent[])
    case 'blockquote':
    case 'list':
    case 'listItem':
    case 'table':
    case 'tableRow':
    case 'tableCell': {
      if ('children' in node && Array.isArray(node.children)) {
        return collapseWhitespace(
          (node.children as Content[]).map(contentToSpeakable).filter(Boolean).join(' ')
        )
      }
      return ''
    }
    case 'thematicBreak':
    case 'yaml':
      return ''
    case 'text':
      return node.value
    case 'image': {
      const img = node as Image
      if (isBadgeUrl(img.url)) {
        return isUsefulAlt(img.alt, img.url) ? narrateBadgeGroup([img.alt!]) ?? '' : ''
      }
      return narrateImage(img.alt, img.url) ?? ''
    }
    case 'link': {
      return phrasingToText((node.children ?? []) as PhrasingContent[])
    }
    default: {
      const anyNode = node as Content & { children?: Content[]; value?: string }
      if (Array.isArray(anyNode.children)) {
        return collapseWhitespace(
          anyNode.children.map(contentToSpeakable).filter(Boolean).join(' ')
        )
      }
      if (typeof anyNode.value === 'string') {
        return collapseWhitespace(anyNode.value)
      }
      return ''
    }
  }
}

/**
 * Convert an ordered list of mdast nodes into podcast-ready speakable text.
 */
export function nodesToSpeakable(nodes: Content[]): string {
  const parts: string[] = []
  for (const node of nodes) {
    const spoken = contentToSpeakable(node)
    if (spoken) parts.push(spoken)
  }
  return collapseWhitespace(parts.join(' '))
}

/** Convenience for tests: parse is done by caller; this only transforms nodes. */
export function rootChildrenToSpeakable(root: Root): string {
  return nodesToSpeakable(root.children as Content[])
}

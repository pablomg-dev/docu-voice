import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import GithubSlugger from 'github-slugger'
import type { Root, Content, Heading } from 'mdast'
import type { SectionType, Section, SourceMetadata } from '@/types'
import { attachSectionSourceUrls } from '@/lib/githubSource'

const MIN_SECTIONS = 1

const WARNING_KEYWORDS = /\b(warning|caution|danger|note)\b/i

// ─── Error ────────────────────────────────────────────────────────────────────

export class ParseError extends Error {
  readonly code = 'PARSE_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract plain text from an mdast node recursively. */
function extractText(node: Content | Root): string {
  if ('value' in node && typeof node.value === 'string') return node.value
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map((c) => extractText(c as Content)).join(' ')
  }
  return ''
}

/** Strip HTML tags from a string using rehype-sanitize (server-safe). */
async function stripHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown)

  // Remove remaining HTML tags from the stringified output
  return String(result)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Classify a top-level mdast node into a SectionType. */
function classifyNode(node: Content): SectionType | null {
  switch (node.type) {
    case 'code':
      return 'code'

    case 'blockquote': {
      const text = extractText(node as unknown as Content).toLowerCase()
      if (WARNING_KEYWORDS.test(text)) return 'warning'
      return 'introduction'
    }

    case 'list':
      return 'steps'

    case 'heading':
      // Headings are section boundaries, not content nodes themselves
      return null

    default:
      return 'introduction'
  }
}

export interface ParseOptions {
  /** When set, each section gets a permalink sourceUrl for that revision. */
  source?: SourceMetadata
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parses raw Markdown text into an ordered list of typed Sections.
 *
 * Strategy:
 * - Walk the top-level AST nodes.
 * - Each heading starts a new section (title = heading text).
 * - Non-heading nodes are accumulated into the current section.
 * - The section type is determined by the dominant node type within it.
 * - Heading sections get GitHub-compatible anchors via github-slugger.
 * - Preamble (Introduction) has headingLevel/anchor null.
 * - Throws ParseError if fewer than MIN_SECTIONS sections are produced.
 */
export async function parse(rawText: string, options?: ParseOptions): Promise<Section[]> {
  const processor = unified().use(remarkParse)
  const tree = processor.parse(rawText) as Root
  const slugger = new GithubSlugger()

  interface RawSection {
    title: string
    nodes: Content[]
    headingLevel: number | null
    /** Raw heading text used for slug generation; null for preamble. */
    headingText: string | null
  }

  const rawSections: RawSection[] = []
  let current: RawSection = {
    title: 'Introduction',
    nodes: [],
    headingLevel: null,
    headingText: null,
  }

  for (const node of tree.children) {
    if (node.type === 'heading') {
      const heading = node as Heading
      // Flush current section if it has content
      if (current.nodes.length > 0) {
        rawSections.push(current)
      }
      const headingText = extractText(heading as unknown as Content)
      const title = headingText.trim() || 'Section'
      current = {
        title,
        nodes: [],
        headingLevel: heading.depth,
        headingText,
      }
    } else {
      current.nodes.push(node as Content)
    }
  }

  // Flush the last section
  if (current.nodes.length > 0 || rawSections.length === 0) {
    rawSections.push(current)
  }

  if (rawSections.length < MIN_SECTIONS) {
    throw new ParseError(
      `Content produced only ${rawSections.length} section(s); minimum is ${MIN_SECTIONS}. ` +
        'Please provide longer or more structured content.'
    )
  }

  // Build Section objects — slugger walks headings in document order so
  // duplicate titles get GitHub-compatible -1, -2, … suffixes.
  const sections: Section[] = []

  for (let i = 0; i < rawSections.length; i++) {
    const raw = rawSections[i]

    // Determine dominant type: code > warning > steps > introduction
    let type: SectionType = 'introduction'
    for (const node of raw.nodes) {
      const classified = classifyNode(node)
      if (classified === 'code') { type = 'code'; break }
      if (classified === 'warning') { type = 'warning'; break }
      if (classified === 'steps' && type === 'introduction') type = 'steps'
    }

    // Build plain text for TTS (strip markdown syntax)
    const rawMarkdown = raw.nodes
      .map((n) => extractText(n as unknown as Content))
      .join('\n\n')

    const text = await stripHtml(rawMarkdown)

    let headingLevel: number | null = null
    let anchor: string | null = null
    if (raw.headingLevel != null && raw.headingText != null) {
      headingLevel = raw.headingLevel
      // github-slugger matches GitHub's duplicate-heading suffix rules
      anchor = slugger.slug(raw.headingText)
    }

    sections.push({
      index: i,
      title: raw.title,
      type,
      text: text || raw.title,
      headingLevel,
      anchor,
      sourceUrl: null,
    })
  }

  if (options?.source) {
    return attachSectionSourceUrls(sections, options.source)
  }

  return sections
}

const FETCH_TIMEOUT_MS = 10_000

// ─── Typed errors ─────────────────────────────────────────────────────────────

export class InvalidUrlError extends Error {
  readonly code = 'INVALID_URL'
  constructor(url: string) {
    super(`Invalid URL: "${url}"`)
    this.name = 'InvalidUrlError'
  }
}

export class HttpError extends Error {
  readonly code = 'HTTP_ERROR'
  constructor(public readonly statusCode: number, url: string) {
    super(`HTTP ${statusCode} fetching "${url}"`)
    this.name = 'HttpError'
  }
}

export class TimeoutError extends Error {
  readonly code = 'TIMEOUT'
  constructor(url: string) {
    super(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s fetching "${url}"`)
    this.name = 'TimeoutError'
  }
}

export class NetworkError extends Error {
  readonly code = 'NETWORK_ERROR'
  constructor(url: string, cause?: unknown) {
    super(`Network error fetching "${url}"`)
    this.name = 'NetworkError'
    if (cause instanceof Error) this.cause = cause
  }
}

// ─── GitHub URL rewriting ─────────────────────────────────────────────────────

/**
 * Detects a GitHub repository URL (github.com/owner/repo) and rewrites it
 * to the raw README URL on raw.githubusercontent.com.
 *
 * Examples:
 *   https://github.com/vercel/next.js
 *   → https://raw.githubusercontent.com/vercel/next.js/HEAD/README.md
 */
export function rewriteGitHubUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  if (parsed.hostname !== 'github.com') return url

  // Path segments: ['', 'owner', 'repo', ...rest]
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length < 2) return url

  const [owner, repo] = segments
  // Only rewrite bare repo URLs (no sub-paths like /blob/main/...)
  if (segments.length === 2) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`
  }

  return url
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export interface FetchResult {
  content: string
  sourceUrl: string
}

/**
 * Fetches the content of a URL, with GitHub README auto-resolution and a
 * 10-second timeout. Throws typed errors for all failure modes.
 */
export async function fetchContent(rawUrl: string): Promise<FetchResult> {
  // Validate URL format before any network request
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new InvalidUrlError(rawUrl)
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new InvalidUrlError(rawUrl)
  }

  const resolvedUrl = rewriteGitHubUrl(rawUrl)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(resolvedUrl, { signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TimeoutError(resolvedUrl)
    }
    throw new NetworkError(resolvedUrl, err)
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    throw new HttpError(response.status, resolvedUrl)
  }

  const content = await response.text()
  return { content, sourceUrl: resolvedUrl }
}

import type { SourceMetadata } from '@/types'

const GITHUB_API = 'https://api.github.com'
const FETCH_TIMEOUT_MS = 10_000

// ─── Errors ───────────────────────────────────────────────────────────────────

export class GitHubRepoNotFoundError extends Error {
  readonly code = 'GITHUB_REPO_NOT_FOUND'
  constructor(repo: string) {
    super(`GitHub repository not found: ${repo}`)
    this.name = 'GitHubRepoNotFoundError'
  }
}

export class GitHubReadmeNotFoundError extends Error {
  readonly code = 'GITHUB_README_NOT_FOUND'
  constructor(repo: string) {
    super(`No README found in repository: ${repo}`)
    this.name = 'GitHubReadmeNotFoundError'
  }
}

export class GitHubRateLimitError extends Error {
  readonly code = 'GITHUB_RATE_LIMIT'
  constructor() {
    super('GitHub API rate limit exceeded. Try again later or set GITHUB_TOKEN.')
    this.name = 'GitHubRateLimitError'
  }
}

export class GitHubAuthError extends Error {
  readonly code = 'GITHUB_AUTH_ERROR'
  constructor(repo: string) {
    super(`No access to GitHub repository (private or forbidden): ${repo}`)
    this.name = 'GitHubAuthError'
  }
}

export class GitHubApiError extends Error {
  readonly code = 'GITHUB_API_ERROR'
  constructor(message: string, public readonly statusCode?: number) {
    super(message)
    this.name = 'GitHubApiError'
  }
}

// ─── URL parsing ──────────────────────────────────────────────────────────────

export interface GitHubRepoRef {
  owner: string
  repo: string
  /** Canonical https://github.com/owner/repo URL (no .git suffix). */
  url: string
}

/**
 * Parses a bare GitHub repository URL (github.com/owner/repo).
 * Returns null for non-GitHub hosts or URLs with extra path segments
 * (blob/tree/raw/… are not resolved here).
 */
export function parseGitHubRepoUrl(rawUrl: string): GitHubRepoRef | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  const host = parsed.hostname === 'www.github.com' ? 'github.com' : parsed.hostname
  if (host !== 'github.com') return null

  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length !== 2) return null

  const owner = segments[0]
  let repo = segments[1]
  if (repo.endsWith('.git')) repo = repo.slice(0, -4)
  if (!owner || !repo) return null

  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  }
}

/** Permanent blob URL for a file at an exact commit, optionally with a heading anchor. */
export function buildSourcePermalink(
  source: SourceMetadata,
  anchor?: string | null
): string {
  const base = `https://github.com/${source.repo}/blob/${source.commitSha}/${source.path}`
  if (anchor) return `${base}#${anchor}`
  return base
}

/** Attach permalink sourceUrl to each section from shared source metadata. */
export function attachSectionSourceUrls<T extends { anchor?: string | null; sourceUrl?: string | null }>(
  sections: T[],
  source: SourceMetadata
): T[] {
  return sections.map((section) => ({
    ...section,
    sourceUrl: buildSourcePermalink(source, section.anchor ?? null),
  }))
}

// ─── GitHub API ───────────────────────────────────────────────────────────────

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DocuVoice',
  }
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_API_TOKEN
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

async function githubFetch(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: githubHeaders(),
      redirect: 'follow',
    })
  } finally {
    clearTimeout(timer)
  }
}

function repoSlug(owner: string, repo: string): string {
  return `${owner}/${repo}`
}

async function throwForGitHubStatus(
  response: Response,
  owner: string,
  repo: string,
  kind: 'repo' | 'readme' | 'commit'
): Promise<never> {
  const slug = repoSlug(owner, repo)
  if (response.status === 404) {
    if (kind === 'readme') throw new GitHubReadmeNotFoundError(slug)
    throw new GitHubRepoNotFoundError(slug)
  }
  if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining')
    const body = await response.text().catch(() => '')
    if (remaining === '0' || /rate limit/i.test(body)) {
      throw new GitHubRateLimitError()
    }
    throw new GitHubAuthError(slug)
  }
  if (response.status === 401) {
    throw new GitHubAuthError(slug)
  }
  throw new GitHubApiError(
    `GitHub API error (${response.status}) for ${slug}`,
    response.status
  )
}

export interface ResolvedGitHubReadme {
  source: SourceMetadata
  content: string
  /** raw.githubusercontent.com URL pinned to the commit SHA (not HEAD). */
  rawUrl: string
}

/**
 * Resolves the default branch tip commit, locates the README at that SHA,
 * and returns the README body decoded from the GitHub API (never HEAD).
 */
export async function resolveGitHubReadme(
  owner: string,
  repo: string,
  originalUrl: string
): Promise<ResolvedGitHubReadme> {
  const slug = repoSlug(owner, repo)

  // 1. Default branch
  const repoRes = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}`)
  if (!repoRes.ok) await throwForGitHubStatus(repoRes, owner, repo, 'repo')
  const repoJson = (await repoRes.json()) as { default_branch?: string }
  const defaultBranch = repoJson.default_branch
  if (!defaultBranch) {
    throw new GitHubApiError(`Repository ${slug} has no default branch`)
  }

  // 2. Exact commit SHA for that branch
  const commitRes = await githubFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(defaultBranch)}`
  )
  if (!commitRes.ok) await throwForGitHubStatus(commitRes, owner, repo, 'commit')
  const commitJson = (await commitRes.json()) as { sha?: string }
  const commitSha = commitJson.sha
  if (!commitSha || !/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new GitHubApiError(`Could not resolve commit SHA for ${slug}@${defaultBranch}`)
  }

  // 3. README at that commit (not HEAD)
  const readmeRes = await githubFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/readme?ref=${encodeURIComponent(commitSha)}`
  )
  if (!readmeRes.ok) await throwForGitHubStatus(readmeRes, owner, repo, 'readme')
  const readmeJson = (await readmeRes.json()) as {
    path?: string
    content?: string
    encoding?: string
  }

  const path = readmeJson.path
  if (!path) {
    throw new GitHubReadmeNotFoundError(slug)
  }

  let content: string
  if (readmeJson.encoding === 'base64' && typeof readmeJson.content === 'string') {
    content = Buffer.from(readmeJson.content.replace(/\s/g, ''), 'base64').toString('utf8')
  } else {
    throw new GitHubApiError(`Unexpected README encoding for ${slug}`)
  }

  const source: SourceMetadata = {
    url: originalUrl,
    repo: slug,
    ref: defaultBranch,
    commitSha,
    path,
  }

  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${path}`

  return { source, content, rawUrl }
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseGitHubRepoUrl,
  buildSourcePermalink,
  attachSectionSourceUrls,
  resolveGitHubReadme,
  GitHubRepoNotFoundError,
  GitHubReadmeNotFoundError,
  GitHubRateLimitError,
  GitHubAuthError,
} from '@/lib/githubSource'
import { fetchContent } from '@/lib/contentFetcher'

const COMMIT_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('parseGitHubRepoUrl', () => {
  it('parses bare owner/repo URLs', () => {
    expect(parseGitHubRepoUrl('https://github.com/vercel/next.js')).toEqual({
      owner: 'vercel',
      repo: 'next.js',
      url: 'https://github.com/vercel/next.js',
    })
  })

  it('strips .git and accepts www', () => {
    expect(parseGitHubRepoUrl('https://www.github.com/acme/app.git')).toEqual({
      owner: 'acme',
      repo: 'app',
      url: 'https://github.com/acme/app',
    })
  })

  it('rejects blob paths and non-GitHub hosts', () => {
    expect(parseGitHubRepoUrl('https://github.com/acme/app/blob/main/README.md')).toBeNull()
    expect(parseGitHubRepoUrl('https://example.com/acme/app')).toBeNull()
  })
})

describe('buildSourcePermalink', () => {
  const source = {
    url: 'https://github.com/acme/app',
    repo: 'acme/app',
    ref: 'main',
    commitSha: COMMIT_SHA,
    path: 'README.md',
  }

  it('builds a blob URL without fragment when anchor is null', () => {
    expect(buildSourcePermalink(source, null)).toBe(
      `https://github.com/acme/app/blob/${COMMIT_SHA}/README.md`
    )
  })

  it('appends the heading anchor when present', () => {
    expect(buildSourcePermalink(source, 'install')).toBe(
      `https://github.com/acme/app/blob/${COMMIT_SHA}/README.md#install`
    )
  })
})

describe('attachSectionSourceUrls', () => {
  it('sets permalinks per section anchor', () => {
    const source = {
      url: 'https://github.com/acme/app',
      repo: 'acme/app',
      ref: 'main',
      commitSha: COMMIT_SHA,
      path: 'docs/README.md',
    }
    const sections = attachSectionSourceUrls(
      [
        { title: 'Intro', anchor: null as string | null, sourceUrl: null as string | null },
        { title: 'Install', anchor: 'install' as string | null, sourceUrl: null as string | null },
      ],
      source
    )
    expect(sections[0].sourceUrl).toBe(
      `https://github.com/acme/app/blob/${COMMIT_SHA}/docs/README.md`
    )
    expect(sections[1].sourceUrl).toBe(
      `https://github.com/acme/app/blob/${COMMIT_SHA}/docs/README.md#install`
    )
  })
})

describe('resolveGitHubReadme', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GITHUB_TOKEN
  })

  it('resolves default branch, commit SHA, README path, and pinned content', async () => {
    const readmeBody = '# Hello\n\nWorld'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/repos/acme/app')) {
        return jsonResponse({ default_branch: 'main' })
      }
      if (url.includes('/commits/main')) {
        return jsonResponse({ sha: COMMIT_SHA })
      }
      if (url.includes('/readme?ref=')) {
        expect(url).toContain(COMMIT_SHA)
        expect(url).not.toContain('HEAD')
        return jsonResponse({
          path: 'README.md',
          encoding: 'base64',
          content: Buffer.from(readmeBody, 'utf8').toString('base64'),
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await resolveGitHubReadme('acme', 'app', 'https://github.com/acme/app')

    expect(result.content).toBe(readmeBody)
    expect(result.source).toEqual({
      url: 'https://github.com/acme/app',
      repo: 'acme/app',
      ref: 'main',
      commitSha: COMMIT_SHA,
      path: 'README.md',
    })
    expect(result.rawUrl).toBe(
      `https://raw.githubusercontent.com/acme/app/${COMMIT_SHA}/README.md`
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('throws when the repository is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'Not Found' }, 404)))
    await expect(
      resolveGitHubReadme('nope', 'missing', 'https://github.com/nope/missing')
    ).rejects.toBeInstanceOf(GitHubRepoNotFoundError)
  })

  it('throws when README is missing at the resolved SHA', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/repos/acme/app')) return jsonResponse({ default_branch: 'main' })
      if (url.includes('/commits/')) return jsonResponse({ sha: COMMIT_SHA })
      if (url.includes('/readme')) return jsonResponse({ message: 'Not Found' }, 404)
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      resolveGitHubReadme('acme', 'app', 'https://github.com/acme/app')
    ).rejects.toBeInstanceOf(GitHubReadmeNotFoundError)
  })

  it('throws on rate limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ message: 'API rate limit exceeded' }, 403, {
          'x-ratelimit-remaining': '0',
        })
      )
    )
    await expect(
      resolveGitHubReadme('acme', 'app', 'https://github.com/acme/app')
    ).rejects.toBeInstanceOf(GitHubRateLimitError)
  })

  it('throws on private/forbidden repos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ message: 'Bad credentials' }, 403, {
          'x-ratelimit-remaining': '60',
        })
      )
    )
    await expect(
      resolveGitHubReadme('acme', 'private', 'https://github.com/acme/private')
    ).rejects.toBeInstanceOf(GitHubAuthError)
  })
})

describe('fetchContent GitHub pinning', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns source metadata and never fetches HEAD for bare repo URLs', async () => {
    const readmeBody = '# Pinned\n\nContent'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).not.toContain('/HEAD/')
      if (url.includes('api.github.com/repos/acme/app') && !url.includes('/commits') && !url.includes('/readme')) {
        return jsonResponse({ default_branch: 'develop' })
      }
      if (url.includes('/commits/develop')) return jsonResponse({ sha: COMMIT_SHA })
      if (url.includes('/readme?ref=')) {
        return jsonResponse({
          path: 'Readme.md',
          encoding: 'base64',
          content: Buffer.from(readmeBody, 'utf8').toString('base64'),
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchContent('https://github.com/acme/app')

    expect(result.content).toBe(readmeBody)
    expect(result.source?.commitSha).toBe(COMMIT_SHA)
    expect(result.source?.ref).toBe('develop')
    expect(result.source?.path).toBe('Readme.md')
    expect(result.sourceUrl).toContain(COMMIT_SHA)
    expect(result.sourceUrl).not.toContain('HEAD')
  })
})

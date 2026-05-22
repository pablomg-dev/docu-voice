# DocuVoice — Agent Instructions

## Project Overview
Turn any documentation (GitHub README URLs or raw text) into a multi-voice audio podcast using ElevenLabs TTS. Built with Next.js 16 + TypeScript.

## Developer Commands

### Setup
```bash
cd docuvoice
npm install
cp .env.local .env.local   # edit with ELEVENLABS_API_KEY
```

### Run
```bash
npm run dev        # Next.js dev server
npm run build      # Production build
npm start          # Start production server
```

### Test
```bash
npm test           # Run all tests once
npm run test:watch # Watch mode
```

### Lint
```bash
npm run lint       # ESLint
```

## Architecture

### Entry Points
- **Frontend**: `app/page.tsx` (main UI), `app/layout.tsx` (root layout)
- **API Routes**: `app/api/process/route.ts` (SSE streaming generator), `app/api/download/[sessionId]/route.ts` (audio download), `app/api/voices/route.ts` (voice list), `app/api/session/[sessionId]/route.ts` (session metadata)

### Core Libraries (`lib/`)
| File | Purpose |
|------|---------|
| `contentFetcher.ts` | Fetches URLs, rewrites GitHub URLs to raw content, 10s timeout |
| `parser.ts` | Markdown → typed sections (intro/code/warning/steps) via unified/remark/rehype |
| `ttsEngine.ts` | ElevenLabs TTS generation, single-voice retry logic |
| `sfxEngine.ts` | Transition sound effects, graceful fallback to silent buffer |
| `audioAssembler.ts` | Concatenates segments + transitions via fluent-ffmpeg, computes timestamps |
| `sessionStore.ts` | In-memory session storage with 30-minute TTL (globalThis singleton) |
| `voiceMap.ts` | Voice assignments per section type, Spanish language detection |
| `fileNames.ts` | Slugify titles for MP3 filenames |

### Key Files
- `next.config.ts`: Server-side external packages for ffmpeg binaries, Turbopack ignores for binary assets
- `vitest.config.ts`: JSDOM environment, globals enabled, `@/` alias
- `types/index.ts`: Shared TypeScript types (Section, AudioSegment, AudioTimeline, ProgressEvent)

## Critical Constraints

### Environment
- `ELEVENLABS_API_KEY` is **required** — server refuses to start without it
- ffmpeg/ffprobe binaries are **server-only**; `serverExternalPackages` prevents bundling errors
- Session data lives in-memory with 30-minute TTL — no persistence

### API Flow
1. `POST /api/process` → SSE stream with progress events (parsing → voices → transitions → ready)
2. `GET /api/session/[sessionId]` → Session metadata (no audio buffers)
3. `GET /api/download/[sessionId]` → Full MP3 or individual section (supports HTTP range requests)
4. `GET /api/voices` → ElevenLabs voice list (falls back to static list on API error)

### Testing Quirks
- Uses **Vitest + fast-check** for property-based tests
- Single test file: `lib/__tests__/fileNames.test.ts`
- Tests use `@testing-library/jest-dom` via `vitest.setup.ts`

### Voice Assignments
| Section Type | Voice | Voice ID |
|--------------|-------|----------|
| introduction | Jessica | `cgSgspJ2msm6clMCkdW9` |
| code | Adam | `pNInz6obpgDQGcFmaJgB` |
| warning | Antoni | `ErXwobaYiN019PkySvjV` |
| steps | Bella | `EXAVITQu4vr4xnSDxMaL` |

Single Voice mode uses Jessica for all sections.

### Known Gotchas
- Minimum 3 sections required; parser throws `ParseError` if fewer
- Spanish content triggers a warning (voiceMap detects 4+ Spanish markers)
- Raw text input requires ≥100 characters
- SFX generation failures fall back to silent 0.5s buffers (no error propagation)
- TTS retries once per section before throwing `TtsError`

## Files to Avoid Modifying
- `node_modules/` — especially ffmpeg/ffprobe binaries
- `.next/` — build artifacts
- `public/demo/` — demo assets

## Debugging
- Server logs show TTS attempt failures (`[TTS] Attempt 1 failed...`)
- Session timestamps logged in `audioAssembler.ts` and `session/route.ts`
- SSE events stream progress: `parsing`, `voices`, `transitions`, `ready`

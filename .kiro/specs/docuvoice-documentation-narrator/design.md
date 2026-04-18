# Design Document

## Overview

DocuVoice is a Next.js web application that converts technical documentation and README files into navigable, multi-voice audio podcast experiences. The system fetches or accepts raw Markdown/text, parses it into typed sections, generates speech audio via ElevenLabs, assembles an Audio_Timeline with transition effects, and presents the result in a podcast-style player with per-section and full-document download capability.

The architecture follows a clean separation between a Next.js frontend (React components) and Next.js API routes that act as a secure backend proxy to the ElevenLabs API. All ElevenLabs API calls are made server-side so credentials are never exposed to the browser.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│                                                              │
│  InputScreen ──► ProgressIndicator ──► PlayerScreen         │
│       │                                      │               │
│  DemoMode                            SidebarWithPreview      │
│                                      ExportButtons           │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP (fetch)
┌──────────────────────────▼──────────────────────────────────┐
│                   Next.js API Routes                         │
│                                                              │
│  /api/process   /api/voices   /api/download/[id]            │
│       │                            │                         │
│  Content_Fetcher                   │                         │
│  Parser                            │                         │
│  TTS_Engine ──────────────────────►│                         │
│  SFX_Engine                        │                         │
│  Audio_Assembler                   │                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                    ElevenLabs API                            │
│  Text-to-Speech  │  Sound Effects  │  Music  │  Voices      │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Next.js full-stack**: API routes live alongside the React frontend in one repo, simplifying deployment and keeping the ElevenLabs API key server-side only.
2. **Streaming audio via blob URLs**: Generated audio is stored temporarily on the server (or in memory) and served via `/api/download/[id]` so the browser can stream or download without re-generating.
3. **Demo Mode uses bundled assets**: Pre-generated audio files for the demo README are committed to `public/demo/` so Demo Mode works with zero API calls.
4. **Progress via Server-Sent Events (SSE)**: The `/api/process` endpoint streams progress events so the frontend can update the step indicator in real time without polling.

---

## Component Design

### Frontend Components

#### `InputScreen`
- Renders a URL input field and a raw text textarea (tab-switched).
- Validates input client-side before submission (empty check, character limit, URL format).
- Displays a "Load Demo" button that bypasses the API and loads demo assets.
- On submit, transitions to `ProgressIndicator`.

#### `ProgressIndicator`
- Receives a stream of SSE events from `/api/process`.
- Renders four ordered steps: "Parsing content", "Generating voices", "Adding transitions", "Ready".
- Each step has three visual states: pending, active, complete, error.
- On completion, transitions to `PlayerScreen`.
- On error, marks the failed step with an error indicator and renders an `ErrorBanner`.

#### `ErrorBanner`
- Dismissible UI component rendered inline (no page navigation).
- Accepts a `message` string and an optional `onRetry` callback.
- Displayed for fetch errors, short-content errors, validation errors, and generation errors.

#### `PlayerScreen`
- Wraps `AudioPlayer`, `SectionSidebar`, and `ExportButtons`.
- Holds playback state (current time, playing/paused, active section index).

#### `AudioPlayer`
- Uses the HTML5 `<audio>` element with a blob URL pointing to the full assembled MP3.
- Exposes play, pause, seek, previous-section, next-section controls.
- Renders a progress bar with current time / total duration.

#### `SectionSidebar`
- Renders the ordered list of sections with title, Section_Type badge, a play button, and a download button per section.
- Highlights the currently active section during playback.
- Play button seeks the main `AudioPlayer` to the section's start timestamp and begins playback; highlights while that section is active.
- Download button triggers a fetch to `/api/download/[id]?section=N` for the individual section MP3.

#### `ExportButtons`
- "Download Full Audio" button triggers a fetch to `/api/download/[id]` for the full MP3.
- Filenames are derived from the document title (slugified) plus a timestamp.

#### `DemoMode`
- Activated by the "Load Demo" button on `InputScreen`.
- Loads a hardcoded section list and pre-bundled audio blob URLs from `public/demo/`.
- Displays a persistent "Demo Mode" banner in the `PlayerScreen`.
- Provides an "Exit Demo" button that returns to `InputScreen`.

---

### Backend Modules (API Routes)

#### `POST /api/process`

Orchestrates the full pipeline and streams progress via SSE.

**Request body:**
```json
{
  "url": "https://...",       // optional
  "text": "raw markdown...",  // optional (one of url or text required)
  "backgroundMusic": false
}
```

**SSE event stream:**
```
data: {"step": "parsing",     "status": "active"}
data: {"step": "parsing",     "status": "complete"}
data: {"step": "voices",      "status": "active"}
data: {"step": "voices",      "status": "complete"}
data: {"step": "transitions", "status": "active"}
data: {"step": "transitions", "status": "complete"}
data: {"step": "ready",       "status": "complete", "sessionId": "abc123"}
```

On error:
```
data: {"step": "voices", "status": "error", "message": "ElevenLabs API returned 429"}
```

**Pipeline steps:**
1. `Content_Fetcher.fetch(url)` or use raw text directly.
2. Validate minimum content length (≥ 100 chars, ≥ 3 sections after parsing).
3. `Parser.parse(rawText)` → `Section[]`.
4. `TTS_Engine.generateAll(sections)` → `AudioSegment[]`.
5. `SFX_Engine.generateTransitions(count)` → `AudioSegment[]`.
6. `Audio_Assembler.assemble(segments, transitions)` → `AudioTimeline`.
7. Store `AudioTimeline` in a server-side session store keyed by `sessionId`.
8. Emit `ready` event with `sessionId`.

#### `GET /api/download/[sessionId]`

Returns the full assembled MP3 for the given session.

Query params:
- `section=N` (optional): returns only the audio for section index N.

Response: `audio/mpeg` stream with `Content-Disposition: attachment; filename="..."`.

#### `GET /api/voices`

Returns available ElevenLabs voices. Falls back to a static list if the API is unavailable.

---

### Core Backend Modules

#### `Content_Fetcher`

```typescript
interface FetchResult {
  content: string;
  sourceUrl: string;
}

async function fetch(url: string): Promise<FetchResult>
```

- Validates URL format before making any network request.
- Detects GitHub repository URLs (`github.com/{owner}/{repo}`) and rewrites to `raw.githubusercontent.com/{owner}/{repo}/HEAD/README.md`.
- Sets a 10-second timeout via `AbortController`.
- Throws typed errors: `InvalidUrlError`, `HttpError(statusCode)`, `TimeoutError`, `NetworkError`.

#### `Parser`

```typescript
interface Section {
  index: number;
  title: string;
  type: SectionType;  // 'introduction' | 'code' | 'warning' | 'steps'
  text: string;
  startTimestamp?: number;  // set after audio assembly
}

function parse(rawText: string): Section[]
```

- Uses `unified` + `remark-parse` to build an AST.
- Walks the AST to identify headings (section boundaries), fenced code blocks, blockquotes with warning keywords, and standalone lists.
- Strips HTML tags using `rehype-sanitize` after converting Markdown to HTML.
- Returns sections in document order.
- Throws `ParseError` if result has fewer than 3 sections.

#### `TTS_Engine`

```typescript
async function generateAll(sections: Section[]): Promise<AudioSegment[]>
async function generateOne(section: Section): Promise<AudioSegment>
```

- Maps each section's `type` to a voice ID via `Voice_Map`.
- Calls ElevenLabs `/v1/text-to-speech/{voice_id}` with `model_id: "eleven_monolingual_v1"`.
- Retries once on failure before throwing `TtsError`.
- Returns `AudioSegment` objects containing the audio buffer and duration.

**Voice_Map:**
| Section_Type  | ElevenLabs Voice |
|---------------|-----------------|
| introduction  | Rachel           |
| code          | Adam             |
| warning       | Antoni           |
| steps         | Bella            |

#### `SFX_Engine`

```typescript
async function generateTransitions(count: number): Promise<AudioSegment[]>
```

- Calls ElevenLabs Sound Effects API with prompt `"subtle whoosh chime transition"`.
- Limits each effect to 2 seconds.
- On API error, returns a silent 0.5-second buffer for that transition slot (graceful degradation).

#### `Audio_Assembler`

```typescript
interface AudioTimeline {
  sessionId: string;
  fullMp3: Buffer;
  sections: Array<Section & { startTimestamp: number; endTimestamp: number }>;
  sectionMp3s: Buffer[];
}

function assemble(
  segments: AudioSegment[],
  transitions: AudioSegment[],
  backgroundMusic?: AudioSegment
): AudioTimeline
```

- Concatenates audio buffers in order: `[seg0, sfx0, seg1, sfx1, ..., segN]`.
- Records `startTimestamp` and `endTimestamp` for each section (used by the Player for seeking and sidebar play buttons).
- Optionally mixes background music at ≤ 20% volume using `fluent-ffmpeg`.
- Uses `ffmpeg` (via `fluent-ffmpeg`) for all audio concatenation and mixing.

#### `SessionStore`

- In-memory `Map<sessionId, AudioTimeline>` with a 30-minute TTL.
- `sessionId` is a `crypto.randomUUID()` value.
- Provides `get(sessionId)`, `set(sessionId, timeline)`, `delete(sessionId)`.

---

## Data Models

```typescript
type SectionType = 'introduction' | 'code' | 'warning' | 'steps';

interface Section {
  index: number;
  title: string;
  type: SectionType;
  text: string;
  startTimestamp?: number;
  endTimestamp?: number;
}

interface AudioSegment {
  buffer: Buffer;
  durationMs: number;
}

interface AudioTimeline {
  sessionId: string;
  fullMp3: Buffer;
  sections: Array<Section & { startTimestamp: number; endTimestamp: number }>;
  sectionMp3s: Buffer[];
  createdAt: Date;
}

type ProcessingStep = 'parsing' | 'voices' | 'transitions' | 'ready';
type StepStatus = 'pending' | 'active' | 'complete' | 'error';

interface ProgressEvent {
  step: ProcessingStep;
  status: StepStatus;
  message?: string;
  sessionId?: string;  // present only on ready event
}
```

---

## Error Handling Strategy

| Error Source | Error Type | UI Response |
|---|---|---|
| Invalid URL format | `InvalidUrlError` | ErrorBanner: "The URL you entered is not valid." |
| HTTP non-2xx | `HttpError(code)` | ErrorBanner: "Could not reach the URL (HTTP {code})." |
| Fetch timeout | `TimeoutError` | ErrorBanner: "The request timed out after 10 seconds." |
| Content too short | `ShortContentError` | ErrorBanner: "Content is too short to narrate (minimum 3 sections)." |
| ElevenLabs TTS error | `TtsError` | Progress step "Generating voices" marked error + ErrorBanner with retry. |
| ElevenLabs SFX error | (graceful) | Transition omitted silently; no user-visible error. |
| Missing API key | `ConfigError` | Server refuses to start; logged to stderr. |

All errors are returned from API routes as JSON `{ error: string, code: string }` with appropriate HTTP status codes. The frontend maps these to `ErrorBanner` messages.

---

## Demo Mode Design

- A hardcoded Next.js README excerpt is stored in `src/lib/demo/demoContent.ts`.
- Pre-generated audio files are stored in `public/demo/` as `section-0.mp3` through `section-N.mp3` and `full.mp3`.
- `DemoMode` component constructs an `AudioTimeline`-shaped object from these static assets using blob URLs created from fetched `public/demo/` files.
- No calls are made to `/api/process` or any ElevenLabs endpoint.
- A "Demo Mode" badge is displayed persistently in the player header.

---

## File Structure

```
docuvoice/
├── public/
│   └── demo/
│       ├── full.mp3
│       ├── section-0.mp3
│       ├── section-1.mp3
│       └── ...
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Root page, renders InputScreen
│   │   └── api/
│   │       ├── process/
│   │       │   └── route.ts          # POST /api/process (SSE)
│   │       ├── download/
│   │       │   └── [sessionId]/
│   │       │       └── route.ts      # GET /api/download/[sessionId]
│   │       └── voices/
│   │           └── route.ts          # GET /api/voices
│   ├── components/
│   │   ├── InputScreen.tsx
│   │   ├── ProgressIndicator.tsx
│   │   ├── ErrorBanner.tsx
│   │   ├── PlayerScreen.tsx
│   │   ├── AudioPlayer.tsx
│   │   ├── SectionSidebar.tsx
│   │   ├── ExportButtons.tsx
│   │   └── DemoMode.tsx
│   ├── lib/
│   │   ├── contentFetcher.ts
│   │   ├── parser.ts
│   │   ├── ttsEngine.ts
│   │   ├── sfxEngine.ts
│   │   ├── audioAssembler.ts
│   │   ├── sessionStore.ts
│   │   ├── voiceMap.ts
│   │   └── demo/
│   │       └── demoContent.ts
│   └── types/
│       └── index.ts
├── .env.local                        # ELEVENLABS_API_KEY (not committed)
├── next.config.ts
└── package.json
```

---

## Correctness Properties

### Property 1: Parser section order invariant
For any valid Markdown input, the sections returned by `Parser.parse()` MUST appear in the same order as the corresponding headings/blocks in the source document. Formally: for all `i < j`, `sections[i]` appears before `sections[j]` in the source text.

**Test approach:** Property-based test — generate random Markdown documents with N headings in a known order; assert that parsed section titles match the heading order.

### Property 2: Audio_Timeline assembly order invariant
For any ordered list of `AudioSegment[]`, `Audio_Assembler.assemble()` MUST produce an `AudioTimeline` where `sections[i].startTimestamp < sections[i].endTimestamp` and `sections[i].endTimestamp <= sections[i+1].startTimestamp` for all valid `i`.

**Test approach:** Property-based test — generate random lists of segments with random durations; assert timestamp ordering invariant holds.

### Property 3: Error condition coverage
For any input that violates a defined constraint (empty string, fewer than 100 characters, URL returning non-2xx, URL timeout), the system MUST produce a user-visible error and MUST NOT call the ElevenLabs API.

**Test approach:** Property-based test — generate invalid inputs across the constraint space; assert that the API route returns an error response and that no ElevenLabs calls were made (via mock).

### Property 4: Progress step ordering invariant
The sequence of `ProcessingStep` values emitted by `/api/process` MUST always be a prefix of `['parsing', 'voices', 'transitions', 'ready']` and MUST never repeat or skip a step.

**Test approach:** Property-based test — run the pipeline with various inputs (including error cases); collect all emitted steps; assert the sequence is a valid prefix of the canonical order with no duplicates.

### Property 5: Export filename derivation
For any document title string, the filename generated for the full MP3 download MUST be a valid filename (no illegal characters), MUST contain a slug derived from the title, and MUST end with `.mp3`.

**Test approach:** Property-based test — generate random title strings (including Unicode, special characters, empty strings); assert filename validity invariants.

### Property 6: Parser section classification exhaustiveness
For any non-empty Markdown input, every section returned by `Parser.parse()` MUST have a `type` that is one of `['introduction', 'code', 'warning', 'steps']`. No section may have an undefined or unknown type.

**Test approach:** Property-based test — generate random Markdown inputs; assert all returned section types are members of the valid set.

---

## Dependencies

| Package | Purpose |
|---|---|
| `next` | Full-stack React framework |
| `react`, `react-dom` | UI rendering |
| `unified`, `remark-parse`, `remark-rehype`, `rehype-sanitize`, `rehype-stringify` | Markdown parsing pipeline |
| `elevenlabs` | Official ElevenLabs Node.js SDK |
| `fluent-ffmpeg` | Audio concatenation and mixing |
| `ffmpeg-static` | Bundled ffmpeg binary |
| `uuid` | Session ID generation |
| `tailwindcss` | Styling |
| `vitest` | Unit and property-based testing |
| `fast-check` | Property-based test generation |

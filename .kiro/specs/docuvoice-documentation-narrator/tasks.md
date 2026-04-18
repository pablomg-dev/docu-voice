# Implementation Plan: DocuVoice Documentation Narrator

## Overview

Implement DocuVoice as a Next.js full-stack application. The backend API routes act as a secure proxy to ElevenLabs, handling content fetching, parsing, TTS generation, SFX transitions, and audio assembly. The frontend provides an input screen, real-time SSE progress indicator, and a podcast-style player with per-section controls and export options.

## Tasks

- [x] 1. Project setup and core types
  - Initialize a Next.js project with TypeScript and Tailwind CSS
  - Install all dependencies: `unified`, `remark-parse`, `remark-rehype`, `rehype-sanitize`, `rehype-stringify`, `elevenlabs`, `fluent-ffmpeg`, `ffmpeg-static`, `uuid`, `vitest`, `fast-check`
  - Create `src/types/index.ts` with all shared types: `SectionType`, `Section`, `AudioSegment`, `AudioTimeline`, `ProcessingStep`, `StepStatus`, `ProgressEvent`
  - Add `.env.local` with `ELEVENLABS_API_KEY` placeholder and document required env vars in README
  - Configure `vitest` in `vitest.config.ts`
  - _Requirements: 13.1, 13.3_

- [x] 2. Voice map and session store
  - [x] 2.1 Implement `src/lib/voiceMap.ts`
    - Export a `VOICE_MAP` constant mapping each `SectionType` to its ElevenLabs voice name/ID
    - Export a `getVoiceId(type: SectionType): string` helper
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 2.2 Implement `src/lib/sessionStore.ts`
    - Implement an in-memory `Map<string, AudioTimeline>` with 30-minute TTL
    - Export `get`, `set`, and `delete` methods
    - Use `crypto.randomUUID()` for session IDs
    - _Requirements: 8.3, 8.4_

- [x] 3. Content fetcher
  - [x] 3.1 Implement `src/lib/contentFetcher.ts`
    - Define and export typed errors: `InvalidUrlError`, `HttpError`, `TimeoutError`, `NetworkError`
    - Validate URL format before any network request; throw `InvalidUrlError` for malformed URLs
    - Detect GitHub repository URLs and rewrite to `raw.githubusercontent.com` README path
    - Set a 10-second `AbortController` timeout; throw `TimeoutError` on expiry
    - Throw `HttpError(statusCode)` for non-2xx responses
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 3.2 Write unit tests for `contentFetcher`
    - Test invalid URL detection (no network call made)
    - Test GitHub URL rewriting
    - Test timeout error path (mock fetch)
    - Test non-2xx HTTP error path
    - _Requirements: 1.2, 1.3, 1.5_

- [x] 4. Parser
  - [x] 4.1 Implement `src/lib/parser.ts`
    - Use `unified` + `remark-parse` to build an AST
    - Walk AST to identify headings as section boundaries, fenced code blocks (`code` type), blockquotes/admonitions with warning keywords (`warning` type), standalone lists (`steps` type), and all other content (`introduction` type)
    - Strip HTML tags via `rehype-sanitize`
    - Return sections in document order; throw `ParseError` if fewer than 3 sections result
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ]* 4.2 Write property test for parser section order (Property 1)
    - **Property 1: Parser section order invariant**
    - Generate random Markdown documents with N headings in a known order using `fast-check`
    - Assert that parsed section titles appear in the same order as the source headings
    - **Validates: Requirements 3.8**

  - [ ]* 4.3 Write property test for parser section classification exhaustiveness (Property 6)
    - **Property 6: Parser section classification exhaustiveness**
    - Generate random Markdown inputs using `fast-check`
    - Assert every returned section's `type` is a member of `['introduction', 'code', 'warning', 'steps']`
    - **Validates: Requirements 3.2, 3.6**

  - [ ]* 4.4 Write unit tests for `parser`
    - Test fenced code block → `code` type
    - Test blockquote with "warning"/"caution"/"danger"/"note" → `warning` type
    - Test ordered/unordered list → `steps` type
    - Test unclassified content → `introduction` type
    - Test HTML stripping
    - Test `ParseError` thrown when fewer than 3 sections
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 3.9_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. TTS engine
  - [x] 6.1 Implement `src/lib/ttsEngine.ts`
    - Implement `generateOne(section: Section): Promise<AudioSegment>` using the ElevenLabs SDK
    - Use `VOICE_MAP` to select voice ID per section type
    - Retry once on failure before throwing `TtsError`
    - Implement `generateAll(sections: Section[]): Promise<AudioSegment[]>` calling `generateOne` for each section
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 4.5_

  - [ ]* 6.2 Write unit tests for `ttsEngine`
    - Test voice ID selection via `VOICE_MAP` for each section type
    - Test single retry on ElevenLabs API error
    - Test `TtsError` thrown after retry exhaustion
    - _Requirements: 5.1, 5.3_

- [x] 7. SFX engine
  - [x] 7.1 Implement `src/lib/sfxEngine.ts`
    - Implement `generateTransitions(count: number): Promise<AudioSegment[]>`
    - Call ElevenLabs Sound Effects API with prompt `"subtle whoosh chime transition"` and max 2-second duration
    - On API error, return a silent 0.5-second buffer for that slot (graceful degradation)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 7.2 Write unit tests for `sfxEngine`
    - Test that `count` transitions are returned
    - Test graceful degradation: API error returns silent buffer, not thrown error
    - _Requirements: 6.4_

- [x] 8. Audio assembler
  - [x] 8.1 Implement `src/lib/audioAssembler.ts`
    - Implement `assemble(segments, transitions, backgroundMusic?)` using `fluent-ffmpeg`
    - Concatenate buffers in order: `[seg0, sfx0, seg1, sfx1, ..., segN]`
    - Record `startTimestamp` and `endTimestamp` for each section
    - Mix optional background music at ≤ 20% volume
    - Return a complete `AudioTimeline` with `fullMp3`, `sectionMp3s`, and timestamped sections
    - _Requirements: 7.2, 7.3, 8.1, 8.2_

  - [ ]* 8.2 Write property test for audio timeline assembly order (Property 2)
    - **Property 2: Audio_Timeline assembly order invariant**
    - Generate random lists of `AudioSegment[]` with random durations using `fast-check`
    - Assert `sections[i].startTimestamp < sections[i].endTimestamp` and `sections[i].endTimestamp <= sections[i+1].startTimestamp` for all valid `i`
    - **Validates: Requirements 8.1, 8.2**

  - [ ]* 8.3 Write unit tests for `audioAssembler`
    - Test section count matches input segment count
    - Test background music omitted when not provided
    - _Requirements: 8.1, 7.3_

- [x] 9. Export filename utility
  - [x] 9.1 Implement filename derivation utility in `src/lib/audioAssembler.ts` (or a dedicated `src/lib/fileNames.ts`)
    - Export `deriveFilename(title: string, suffix?: string): string`
    - Slugify the title (strip illegal characters, replace spaces with hyphens, lowercase)
    - Append timestamp and `.mp3` extension
    - _Requirements: 17.3, 17.4_

  - [ ]* 9.2 Write property test for export filename derivation (Property 5)
    - **Property 5: Export filename derivation**
    - Generate random title strings (including Unicode, special characters, empty strings) using `fast-check`
    - Assert the result is a valid filename (no illegal characters), contains a slug from the title, and ends with `.mp3`
    - **Validates: Requirements 17.3, 17.4**

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. API route: `/api/process`
  - [x] 11.1 Implement `src/app/api/process/route.ts`
    - Accept `POST` with `{ url?, text?, backgroundMusic }` body
    - Validate: reject empty input, text < 100 chars, missing both `url` and `text`
    - Orchestrate the full pipeline: `Content_Fetcher` → `Parser` → `TTS_Engine` → `SFX_Engine` → `Audio_Assembler` → `SessionStore`
    - Stream SSE progress events for each step: `parsing`, `voices`, `transitions`, `ready`
    - Emit error event with step name and message on failure
    - Return `sessionId` in the `ready` event
    - Read `ELEVENLABS_API_KEY` from environment; refuse to process if missing
    - _Requirements: 1.1–1.5, 2.1–2.3, 3.1–3.9, 5.1–5.5, 6.1–6.4, 8.1–8.4, 12.1, 12.2, 13.1, 13.2, 13.3, 14.1–14.5, 16.1–16.5_

  - [ ]* 11.2 Write property test for progress step ordering (Property 4)
    - **Property 4: Progress step ordering invariant**
    - Run the pipeline with various inputs (including error cases) using mocked ElevenLabs calls
    - Collect all emitted `ProcessingStep` values
    - Assert the sequence is a valid prefix of `['parsing', 'voices', 'transitions', 'ready']` with no duplicates or skips
    - **Validates: Requirements 16.1, 16.2, 16.3**

  - [ ]* 11.3 Write property test for error condition coverage (Property 3)
    - **Property 3: Error condition coverage**
    - Generate invalid inputs (empty string, < 100 chars, URL returning non-2xx, timeout) using `fast-check`
    - Assert the route returns an error response and that no ElevenLabs SDK calls were made (via mock/spy)
    - **Validates: Requirements 1.2, 1.3, 1.5, 2.3, 14.1, 14.2, 14.3**

  - [ ]* 11.4 Write integration tests for `/api/process`
    - Test full happy-path pipeline with mocked ElevenLabs SDK
    - Test each error path returns correct HTTP status and `{ error, code }` JSON
    - _Requirements: 12.1, 14.4_

- [x] 12. API route: `/api/download/[sessionId]`
  - [x] 12.1 Implement `src/app/api/download/[sessionId]/route.ts`
    - Accept `GET` with optional `?section=N` query param
    - Look up `AudioTimeline` from `SessionStore` by `sessionId`; return 404 if not found
    - Without `section`: stream `fullMp3` with `Content-Disposition: attachment; filename="<slug>.mp3"`
    - With `section=N`: stream `sectionMp3s[N]` with filename including section index and type
    - _Requirements: 8.4, 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 13. API route: `/api/voices`
  - [x] 13.1 Implement `src/app/api/voices/route.ts`
    - Accept `GET`; call ElevenLabs voices endpoint via SDK
    - On API failure, return a static fallback voice list with a `stale: true` indicator
    - _Requirements: 10.1, 10.2_

- [x] 14. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Frontend: `InputScreen` component
  - [x] 15.1 Implement `src/components/InputScreen.tsx`
    - Render a tab-switched URL input and raw text textarea
    - Client-side validation: empty check, 50,000-character limit for text, URL format check
    - Display validation errors inline without page navigation
    - Render a "Load Demo" button that activates Demo Mode
    - On valid submit, call `POST /api/process` and transition to `ProgressIndicator`
    - _Requirements: 1.3, 2.1, 2.3, 14.3, 18.1_

  - [ ]* 15.2 Write unit tests for `InputScreen`
    - Test empty submission shows validation error
    - Test text > 50,000 chars shows validation error
    - Test text < 100 chars shows validation error
    - Test malformed URL shows validation error without network call
    - _Requirements: 2.3, 14.3_

- [x] 16. Frontend: `ErrorBanner` component
  - [x] 16.1 Implement `src/components/ErrorBanner.tsx`
    - Accept `message: string` and optional `onRetry: () => void` props
    - Render inline (no page navigation) with a dismiss button
    - Show retry button when `onRetry` is provided
    - _Requirements: 14.1, 14.4, 14.5_

- [x] 17. Frontend: `ProgressIndicator` component
  - [x] 17.1 Implement `src/components/ProgressIndicator.tsx`
    - Connect to the SSE stream from `/api/process`
    - Render four ordered steps: "Parsing content", "Generating voices", "Adding transitions", "Ready"
    - Each step has visual states: pending, active, complete, error
    - Highlight the currently active step; mark completed steps as complete
    - On `ready` event, transition to `PlayerScreen`
    - On error event, mark the failed step with an error indicator and render `ErrorBanner` with retry option
    - _Requirements: 12.2, 16.1, 16.2, 16.3, 16.4, 16.5_

  - [ ]* 17.2 Write unit tests for `ProgressIndicator`
    - Test each step transitions through pending → active → complete states
    - Test error state marks the correct step and shows `ErrorBanner`
    - _Requirements: 16.2, 16.3, 16.5_

- [x] 18. Frontend: `AudioPlayer` component
  - [x] 18.1 Implement `src/components/AudioPlayer.tsx`
    - Use HTML5 `<audio>` element with a blob URL for the full assembled MP3
    - Implement play, pause, seek, previous-section, and next-section controls
    - Render a progress bar showing current time / total duration
    - Expose current time and active section index to parent via callback/state
    - Ensure playback continues when the browser tab is backgrounded
    - _Requirements: 9.1, 9.2, 9.3, 11.3_

  - [ ]* 18.2 Write unit tests for `AudioPlayer`
    - Test play/pause toggle updates state correctly
    - Test previous/next section seek to correct timestamps
    - Test progress bar reflects current time
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 19. Frontend: `SectionSidebar` component
  - [x] 19.1 Implement `src/components/SectionSidebar.tsx`
    - Render ordered list of sections with title, `SectionType` badge, play button, and download button
    - Highlight the currently active section during playback
    - Play button: seek `AudioPlayer` to section's `startTimestamp` and begin playback; highlight while active; pause and return focus when section ends
    - Download button: fetch `/api/download/[sessionId]?section=N` and trigger browser download
    - All tap targets ≥ 44×44 px on mobile viewports
    - _Requirements: 9.4, 9.5, 9.6, 11.1, 11.2, 11.3, 11.4, 11.5, 15.1, 15.2, 15.3, 15.4, 15.5, 17.2, 17.4, 17.5_

  - [ ]* 19.2 Write unit tests for `SectionSidebar`
    - Test active section is highlighted when `activeIndex` prop changes
    - Test play button click triggers seek to correct timestamp
    - Test download button triggers fetch to correct URL
    - _Requirements: 9.5, 9.6, 15.2, 15.3_

- [x] 20. Frontend: `ExportButtons` component
  - [x] 20.1 Implement `src/components/ExportButtons.tsx`
    - Render "Download Full Audio" button that fetches `/api/download/[sessionId]` and triggers browser download
    - Use slugified document title + timestamp as filename
    - _Requirements: 8.4, 9.7, 17.1, 17.3_

- [x] 21. Frontend: `PlayerScreen` component
  - [x] 21.1 Implement `src/components/PlayerScreen.tsx`
    - Compose `AudioPlayer`, `SectionSidebar`, and `ExportButtons`
    - Manage shared playback state: current time, playing/paused, active section index
    - Pass active section index to `SectionSidebar` for highlighting
    - Display "Demo Mode" banner when in demo mode
    - _Requirements: 9.1–9.7, 18.4_

- [x] 22. Frontend: `DemoMode` component and demo assets
  - [x] 22.1 Create `src/lib/demo/demoContent.ts`
    - Export a hardcoded Next.js README excerpt as a `Section[]` array with pre-set types and titles
    - _Requirements: 18.2_

  - [x] 22.2 Add placeholder demo audio assets to `public/demo/`
    - Create `full.mp3`, `section-0.mp3` through `section-N.mp3` as silent placeholder files (to be replaced with pre-generated audio)
    - _Requirements: 18.3_

  - [x] 22.3 Implement `src/components/DemoMode.tsx`
    - Load demo `Section[]` from `demoContent.ts` and construct blob URLs from `public/demo/` audio files
    - Bypass all API calls; directly transition to `PlayerScreen` with demo data
    - Display a persistent "Demo Mode" badge in the player header
    - Provide an "Exit Demo" button that returns to `InputScreen`
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

- [x] 23. Root page and responsive layout
  - [x] 23.1 Implement `src/app/page.tsx`
    - Wire `InputScreen` → `ProgressIndicator` → `PlayerScreen` state machine
    - Integrate `DemoMode` activation from `InputScreen`
    - Apply Tailwind responsive layout supporting 320px–2560px viewports without horizontal scrolling
    - Ensure all interactive controls meet 44×44 px minimum tap target on mobile
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 24. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 25. End-to-end wiring and validation
  - [x] 25.1 Verify the full pipeline end-to-end with mocked ElevenLabs SDK
    - Confirm `InputScreen` → `ProgressIndicator` → `PlayerScreen` flow works with a real Next.js dev server (manual verification)
    - Confirm `sessionId` from SSE `ready` event is used correctly by `PlayerScreen` for download URLs
    - Confirm `ELEVENLABS_API_KEY` missing at startup logs error and prevents API calls
    - _Requirements: 12.1, 13.1, 13.2, 13.3_

  - [ ]* 25.2 Write integration tests for download route
    - Test full MP3 download returns correct `Content-Disposition` header and `audio/mpeg` content type
    - Test section download with `?section=N` returns correct section buffer
    - Test 404 for unknown `sessionId`
    - _Requirements: 8.4, 17.1, 17.2, 17.5_

- [x] 26. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests (Properties 1–6) validate universal correctness invariants using `fast-check`
- Unit tests validate specific examples and edge cases
- All ElevenLabs API calls are server-side only; the API key is never sent to the browser
- Demo Mode requires pre-generated audio files in `public/demo/` — generate these once with real credentials and commit them

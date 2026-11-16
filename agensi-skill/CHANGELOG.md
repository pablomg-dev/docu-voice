# Changelog

All notable changes to the `DocuVoice: README to Podcast` Agensi skill are documented in this file.

## [1.2.0] - 2026-11-16

### Added
- **Optional source traceability:** Sections JSON and assemble manifests may include a top-level `source` object (`url`, `repo`, `ref`, `commitSha`, `path`). Timelines copy it through when present.
- **Optional heading anchors per section:** `headingLevel`, `anchor`, and `sourceUrl` are preserved from input sections into `.timeline.json` (and into `--assemble` / `--split` output). Introduction / preamble sections use `headingLevel: null` and `anchor: null`.
- Permalink shape when source is known: `https://github.com/{owner}/{repo}/blob/{commitSha}/{path}#{anchor}` (fragment omitted when there is no anchor).

### Compatibility
- CLI users are **not** required to call GitHub or supply `source`. Legacy sections JSON and timelines without these fields keep working unchanged.

## [1.1.0] - 2026-11-13

### Added
- **Agensi ElevenLabs tool support (no API key required):** Uses `elevenlabs:text-to-speech` (`$0.052` per 1,000 characters, `eleven_v4` default, MP3 44.1 kHz 128 kbps) and `elevenlabs:v1.sound-generation` (`$0.156` per minute) paid directly from the user's Agensi USD balance.
- **Upfront cost quoting:** Requires calling `quote_tool` before generating audio and reporting the estimated USD cost to the user.
- **5,000-character chunking:** Added `splitTextIntoChunks`, `splitDocumentForLimit`, and CLI `--split <sections.json> --max-chars 5000` so long scripts/sections stay within `elevenlabs:text-to-speech`'s 5,000-character limit.
- **Local assembly mode (`--assemble <manifest.json>`):** Joins downloaded Agensi MP3 clips and optional SFX locally via `ffmpeg` (or byte-concat fallback) and writes `<out>.timeline.json` with zero API keys and zero network calls.
- **Catalog voice documentation:** Clarified that Agensi mode only uses ElevenLabs catalog voices (`elevenlabs:voices`, no voice cloning) and mapped `warning` in Agensi mode to verified catalog voice Daniel (`onwK4e9ZLuTAKqWW03F9`) and `steps` to Bella (`hpp4J3VqNfWAUOO0d1Us`).

### Changed
- **Provider priority order:** Defaults to Agensi's ElevenLabs tools when available; falls back to `ELEVENLABS_API_KEY` (BYOK) when Agensi tools are unavailable or when the user prefers their own key.
- Updated `SKILL.md` and `README.md` with Agensi billing details, catalog-only voice rules, and BYOK alternative instructions.

## [1.0.0] - 2026-11-12

### Added
- Initial Agensi skill release (`SKILL.md`, `scripts/narrate.mjs`, `examples/sample-sections.json`, `README.md`, `.env.example`).
- Section classification (`introduction`, `code`, `warning`, `steps`), speakable-text rewriting, Spanish language heuristic, `ffmpeg` mono re-encode concatenation for stereo SFX compatibility, and BYOK `ELEVENLABS_API_KEY` narration.

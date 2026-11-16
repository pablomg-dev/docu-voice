# DocuVoice: README to Podcast

Agensi marketplace skill derived from [DocuVoice](https://github.com/pablomg-dev/docu-voice). A buyer's agent follows `SKILL.md`: it turns a README or other Markdown into sections, narrates them with ElevenLabs, and writes a local MP3 plus a section timeline.

This folder is the skill package. It does not run the Next.js app.

## Layout

```text
SKILL.md
README.md
CHANGELOG.md
.env.example
scripts/narrate.mjs
scripts/speakable.mjs
examples/sample-sections.json
```

`SKILL.md` is the agent instructions. `scripts/narrate.mjs` and `scripts/speakable.mjs` are Node 18+ scripts with zero npm dependencies.

## How narration & payment work

1. **Agensi tools (default — no API key needed):**
   When your agent has Agensi tools connected, DocuVoice uses Agensi's `elevenlabs:text-to-speech` (`$0.052` per 1,000 characters, max 5,000 characters per call) and `elevenlabs:v1.sound-generation` (`$0.156` per minute) tools.
   - **No ElevenLabs account or API key required.**
   - **Paid from your Agensi balance in USD.** Before generating audio, the agent calls `quote_tool` to show you the exact estimated price. Failed calls cost nothing.
   - **Catalog voices only:** Only voices from Agensi's ElevenLabs catalog (`elevenlabs:voices`) are available; custom voice cloning is not supported.
   - Scripts longer than 5,000 characters per section are automatically split into chunks ≤ 5,000 characters, then joined locally with `scripts/narrate.mjs --assemble`.

2. **Your own ElevenLabs API key (alternative / fallback):**
   If Agensi tools are unavailable—or if you prefer to bill your own ElevenLabs account—you can run `scripts/narrate.mjs` directly with `ELEVENLABS_API_KEY` set in the environment.

## Requirements

- Node.js 18 or newer
- **Either** an Agensi MCP connection with Agensi balance **or** an ElevenLabs API key in `ELEVENLABS_API_KEY`
- `ffmpeg` on `PATH` is optional. Without it (or if it fails), transition sounds are skipped and the script appends MP3 bytes directly. Install `ffmpeg` to enable transitions and mono re-encoding.

For BYOK mode, copy `.env.example` only as a reminder of the variable name. The script does not read `.env` files. Put the key in the environment of the Node process; it is sent only as the `xi-api-key` header to `https://api.elevenlabs.io`.

## Run the script

### Assemble Agensi-generated clips locally (no key needed)

```bash
node scripts/narrate.mjs --assemble manifest.json --mode multi --sfx on --out podcast.mp3
```

### Split sections to fit the 5,000-character Agensi tool limit

```bash
node scripts/narrate.mjs --split examples/sample-sections.json --max-chars 5000 --out chunked-sections.json
```

### Direct BYOK run (using `ELEVENLABS_API_KEY`)

```bash
node scripts/narrate.mjs examples/sample-sections.json --mode multi --sfx on --out podcast.mp3
```

The command writes `podcast.mp3` and `podcast.timeline.json` in the current directory. `--mode` is `single` or `multi` (default `multi`). `--sfx` is `on` or `off` (default `on`). Timestamps in the timeline are estimated from MP3 size at 128 kbps.

### Optional source traceability (v1.2+)

`examples/sample-sections.json` shows an optional top-level `source` object (`url`, `repo`, `ref`, `commitSha`, `path`) plus per-section `headingLevel`, `anchor`, and `sourceUrl`. The CLI copies these into the timeline when present. It never calls GitHub — omit `source` for pasted docs or when you have not pinned a commit.

### Speakable rewrite (v1.3+)

Before classifying sections, rewrite Mermaid, code, images, badges, and HTML into podcast prose:

```bash
node scripts/speakable.mjs --rewrite readme.md --out readme.speakable.md
```

No API keys, no LLM, no network. Then build `sections.json` from the rewritten Markdown and pass it to `narrate.mjs` / Agensi assemble as usual.

Check syntax without calling any API:

```bash
node --check scripts/narrate.mjs
```

In BYOK mode, if `ELEVENLABS_API_KEY` is missing, the script exits with an error before reading the JSON and before any network call.

## Package a ZIP for Agensi

From this folder, so `SKILL.md` is at the top of the archive:

```bash
cd agensi-skill && zip -r ../docuvoice-skill.zip .
```

Do not add `node_modules`. The script has no packages to install. Do not put an API key in the ZIP.

## What it does not do

The skill does not upload the finished local MP3, host a player, store a session, or clone custom voices. Details of the network calls and files read are in the "Permissions & data" section of `SKILL.md`.

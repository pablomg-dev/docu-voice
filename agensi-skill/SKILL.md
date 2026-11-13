---
name: "DocuVoice: README to Podcast"
description: "Narrate a GitHub README, Markdown file, or pasted documentation as a local MP3 podcast. Classifies sections as introduction, code, warning, or steps, speaks them with ElevenLabs in one voice or four, and writes the audio plus a timeline. Uses Agensi's ElevenLabs tool by default (paid from your Agensi balance, no API key required), with your own ELEVENLABS_API_KEY as an optional fallback."
summary: "Turns a README or Markdown document into a local multi-voice MP3 using Agensi's ElevenLabs tool (no key required) or your own ElevenLabs API key."
version: "1.1.0"
tags:
  - documentation
  - podcast
  - text-to-speech
  - elevenlabs
  - markdown
  - audio
  - readme
  - narration
keywords:
  - readme to podcast
  - markdown to audio
  - documentation narrator
  - multi-voice tts
  - elevenlabs
  - github readme
  - podcast generator
  - section timeline
use_cases:
  - "Turn a GitHub README into a podcast you can listen to offline without setting up an ElevenLabs API key"
  - "Narrate a Markdown guide with different voices for code, warnings, and steps"
  - "Make a short audio briefing from pasted release notes"
  - "Preview how a tutorial sounds before recording a human voiceover"
  - "Produce a local MP3 and a section timeline from documentation"
  - "Choose one narrator or four voices for the same document, via Agensi balance or your own key"
docs_url: "https://github.com/pablomg-dev/docu-voice"
---

# DocuVoice: README to Podcast

Turn a README or other Markdown document into a local MP3 podcast. You read the source, split and rewrite it into speakable sections JSON, and then synthesize speech with ElevenLabs:

1. **Primary (Agensi tools available):** Use Agensi's `elevenlabs:text-to-speech` (and `elevenlabs:v1.sound-generation` for transitions) paid from the user's Agensi USD balance. **No ElevenLabs API key is required.** Use `scripts/narrate.mjs --assemble` to join the clips locally into a single MP3 and `.timeline.json`.
2. **Alternative (BYOK — `ELEVENLABS_API_KEY`):** Only when Agensi tools are **not** available in the agent environment, OR when the user explicitly prefers to use their own `ELEVENLABS_API_KEY`, run `scripts/narrate.mjs <sections.json>` directly against `api.elevenlabs.io`.

`examples/sample-sections.json` shows the sections JSON shape. Write the user's files somewhere outside this skill folder. If your runtime copies `scripts/narrate.mjs` to a temporary file, run that copy unchanged.

## Choosing the TTS path

Check in this exact order before asking for anything:

1. **Agensi tools available (`quote_tool`, `run_tool`, `elevenlabs:text-to-speech`):**
   - Use this path by default unless the user specifically asks to use their own `ELEVENLABS_API_KEY`.
   - Never ask the user for an ElevenLabs API key in this mode.
   - **Tell the user upfront:** Agensi mode uses **only voices from Agensi's ElevenLabs catalog** (`elevenlabs:voices`, free to query) and **does not support voice cloning or custom cloned voices**.
2. **No Agensi tools, or user prefers their own key (`ELEVENLABS_API_KEY`):**
   - Use the direct BYOK script flow (`node narrate.mjs <sections.json> ...`).
   - Ask the user for `ELEVENLABS_API_KEY` only when it is missing from the environment and Agensi tools are unavailable (or the user chose BYOK). Pass it solely as that environment variable on the Node process. Keep the key out of the sections file, the timeline, the command arguments, and your reply.

## Permissions & data

This skill narrates text the user already asked to hear. It is not a collector.

### In Agensi tool mode (`--assemble`)
- Speech synthesis calls `elevenlabs:text-to-speech` through Agensi (`quote_tool` then `run_tool`), sending only each chunk's `text`, `voice_id`, and `model_id`.
- Transition sound effects (when `--sfx on` and 2+ chunks) call `elevenlabs:v1.sound-generation` with the fixed prompt `"subtle whoosh chime transition"` and `duration_seconds: 2`.
- `scripts/narrate.mjs --assemble <manifest.json>` reads only local JSON and local `.mp3` files downloaded from the signed `download_link` URLs, makes **no** network requests, and reads **no** API keys.

### In BYOK mode (`ELEVENLABS_API_KEY`)
- The script reads one environment variable, `ELEVENLABS_API_KEY`, and sends it only as the `xi-api-key` header to `https://api.elevenlabs.io` (`redirect: 'error'`). It is not placed in the URL, the MP3, the timeline, or any other file.
- Network hosts:
  - `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}?output_format=mp3_44100_128` with JSON `{"text":"<section text>","model_id":"eleven_turbo_v2_5"}`
  - `POST https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128` with JSON `{"text":"subtle whoosh chime transition","duration_seconds":2}`
- The script refuses redirects, does not upload the finished MP3, and cleans up temporary audio files under the system temp directory.

## What you need

- Node.js 18 or newer (`node` on `PATH`)
- **Either** Agensi MCP tools (`elevenlabs:text-to-speech`, paid from your Agensi balance; no API key needed) **or** `ELEVENLABS_API_KEY` in the Node process environment for BYOK mode
- Optional: `ffmpeg` on `PATH`. Without it (or if it fails), transition sounds are skipped and sections are byte-joined. Install `ffmpeg` to enable transitions and a re-encoded mono join.

## 1. Get the document

Accept a GitHub URL, any other `http` or `https` URL that returns Markdown, a local file path, or text the user pasted.

Pasted text must be at least 100 characters. A URL or a local file can be shorter, as long as you can build at least one section. If the user pasted less than 100 characters, say it is too short and stop.

Give up on a URL after 10 seconds and tell the user. Accept only `http` and `https`. If the response is an HTML page rather than Markdown or plain text, stop and ask for the Markdown source. Do not narrate a website chrome.

Rewrite GitHub URLs to raw content before you download them:

- Host `www.github.com` is treated as `github.com`.
- `https://github.com/owner/repo` (nothing after the repo name) becomes `https://raw.githubusercontent.com/owner/repo/HEAD/README.md`. If the repo segment ends with `.git`, drop that suffix first.
- `https://github.com/owner/repo/blob/<ref>/<path>` becomes `https://raw.githubusercontent.com/owner/repo/<ref>/<path>`.
- `https://github.com/owner/repo/raw/<ref>/<path>` uses the same raw form.
- A URL that is already on `raw.githubusercontent.com` stays as it is.
- Any other host is downloaded as given.

```javascript
function rewriteGitHubUrl(url) {
  let parsed
  try { parsed = new URL(url) } catch { return url }
  const host = parsed.hostname === 'www.github.com' ? 'github.com' : parsed.hostname
  if (host === 'raw.githubusercontent.com') return url
  if (host !== 'github.com') return url
  const segments = parsed.pathname.split('/').filter(Boolean)
  const repoName = (name) => (name.endsWith('.git') ? name.slice(0, -4) : name)
  if (segments.length === 2) {
    const [owner, repo] = segments
    return `https://raw.githubusercontent.com/${owner}/${repoName(repo)}/HEAD/README.md`
  }
  if (segments.length >= 5 && (segments[2] === 'blob' || segments[2] === 'raw')) {
    const [owner, repo, , ref, ...rest] = segments
    return `https://raw.githubusercontent.com/${owner}/${repoName(repo)}/${ref}/${rest.join('/')}`
  }
  return url
}
```

Apply that rule yourself. Do not save it as a second script.

## 2. Split and classify

Work from the Markdown structure. Headings are boundaries. Classify each section as `introduction`, `code`, `warning`, or `steps`.

1. Walk the document from top to bottom.
2. An ATX heading (`#`) or a setext heading starts a new section. The title is the heading text with Markdown marks removed.
3. Content before the first heading belongs to a section titled `Introduction`.
4. Skip a heading that has no body before the next heading. If the document is only headings and one trailing empty heading is all you have, keep a single section whose spoken text is that title.
5. **Split any section whose spoken text would exceed 5,000 characters** into sequential parts (`Install, part 2`, and so on) keeping the same `type`. `elevenlabs:text-to-speech` has a hard **5,000-character limit per request**. Stay at 50 sections/chunks or fewer. (You can also run `node narrate.mjs --split /path/to/sections.json --max-chars 5000 --out /path/to/chunked.json` to split automatically at paragraph, sentence, or word boundaries.)

Pick the type by first match:

1. The body contains a fenced code block or an indented code block (four spaces or a tab). Inline code does not count. Type is `code`.
2. The body contains a blockquote, or it contains the whole word `warning`, `caution`, `danger`, or `note` (case insensitive, so `notebook` does not match). Type is `warning`.
3. The body contains an ordered list, an unordered list, or a task list. Type is `steps`.
4. Otherwise the type is `introduction`.

A section that contains a code block stays `code` even if it also contains a note or a list. A list that also says "note" is `warning`, because the keyword rule is checked first.

## 3. Write speakable text and keep the language

Build `text` only after the type is chosen.

- Remove HTML comments, HTML tags, and Markdown images, including status badges.
- Replace a Markdown link with its visible label and drop the URL.
- Drop bare URLs.
- Turn leftover entities `&amp;`, `&lt;`, `&gt;`, `&quot;`, and `&#39;` into `&`, `<`, `>`, `"`, and `'`.
- If nothing speakable remains, use the section title.
- Start each section's `text` with a short spoken heading taken from the title, so the listener hears the section change.
- Keep the language of the source. Do not translate.

For `code`, do not read the source character by character and do not put the raw source in `text`. Turn each code block into one to three sentences: what it does, then any command as words a person can recognize ("Run npm install"). Mention setting names and the values that matter. Skip braces, semicolons, and indentation.

For `steps`, speak the items in order ("First, ... Second, ...") and keep commands recognizable.

For `warning`, lead with the caution and keep the meaning.

For `introduction`, use continuous prose.

### Spanish heuristic

After the section texts exist, join them with spaces and apply `looksLikeSpanish` to that string. Markers, matched as case-insensitive substrings:

`instalación`, `configuración`, `uso`, `inicio`, `guía`, `descripción`, `requisitos`, `ejemplo`, `pasos`, `notas`, `advertencia`, `importante`, `también`, `para`, `con`, `está`, `son`, `una`, `los`, `las`, `del`, `que`

The check is true only when the joined text has at least 20 ASCII words (`\b\w+\b` in JavaScript, which does not treat accented letters as word characters) and at least 4 distinct markers occur as substrings. Substring matching can fire on English words such as "configuration", "request", "personal", and "model". If the check is true, read the document and decide what language it is actually written in.

Narrate in that language either way. When the document is Spanish, tell the user: "This document appears to be in Spanish. The selected voices are English-trained and may sound unnatural. Consider using Single Voice mode for better results." (In Agensi mode, you can also offer `eleven_multilingual_v2` or a Spanish catalog voice from `elevenlabs:voices` if they want.) Still speak Spanish if that is the document language. If the heuristic fired on English, narrate in English and do not claim the document is Spanish.

## 4. Write the sections JSON

UTF-8 JSON, either an object or a bare array:

```json
{
  "title": "Document title",
  "sections": [
    {
      "index": 0,
      "title": "Introduction",
      "type": "introduction",
      "text": "Introduction. This project generates a local podcast from a README."
    }
  ]
}
```

`type` is exactly `introduction`, `code`, `warning`, or `steps`. `text` is the speakable narration and must be non-empty. `index` may be omitted. `title` may be omitted and then defaults to `Section N`. The document `title` is optional. Do not add a voice id; voices come from the section type and mode. Keep each `text` at or under **5,000 characters** (required for Agensi's `elevenlabs:text-to-speech`; BYOK `eleven_turbo_v2_5` caps at 40,000).

Write this file outside the skill folder. Remember the absolute path.

## 5A. Generate audio with Agensi tools (Primary)

Use this path whenever Agensi tools are available and the user did not ask for BYOK.

### Tool details & catalog-only voices

- **TTS tool:** `elevenlabs:text-to-speech` — **$0.052 per 1,000 characters** (billed per character).
  - `text` (required): **1–5,000 characters**. Split any longer script into chunks ≤ 5,000 characters before quoting.
  - `model_id`: `eleven_v4` (default, most expressive, 80+ languages), `eleven_v4_turbo` (half price), `eleven_flash_v2_5` (half price, fastest), `eleven_multilingual_v2` (29 languages, supports `speed`/`style`), `eleven_v3`.
  - `voice_id`: Catalog voice ID from `elevenlabs:voices` (free). **Only Agensi catalog voices are supported — there is no voice cloning.**
  - Output format: **MP3 44.1 kHz, 128 kbps** (`audio.download_link`, signed ~1h, stored 7 days).
- **Transitions tool (optional):** `elevenlabs:v1.sound-generation` — **$0.156 per minute** (`duration_seconds: 2` is ~$0.0052). Only request when `--sfx on`, there are 2+ chunks, and `ffmpeg` is available on `PATH`.

Default Agensi catalog voices (verified in `elevenlabs:voices`):

| Mode / Section type | Voice | Catalog `voice_id` | Notes |
| --- | --- | --- | --- |
| `single` / `introduction` | Jessica | `cgSgspJ2msm6clMCkdW9` | Playful, bright, warm |
| `code` | Adam | `pNInz6obpgDQGcFmaJgB` | Dominant, firm |
| `warning` | Daniel | `onwK4e9ZLuTAKqWW03F9` | Steady broadcaster (replaces legacy Antoni, which is not in Agensi's catalog) |
| `steps` | Bella | `hpp4J3VqNfWAUOO0d1Us` | Professional, bright, warm |

If the user wants a different voice, call `elevenlabs:voices` (free) to pick another catalog `voice_id` and explicitly remind them that custom/cloned voices are not supported on Agensi.

### Step 1 — Quote first and show estimated cost

Before calling `run_tool` to generate any audio:
1. Ensure every section/chunk is ≤ 5,000 characters (run `node narrate.mjs --split ...` if any section is longer).
2. Call `quote_tool` for `elevenlabs:text-to-speech` (pass `requests` as an array when there are multiple chunks, up to 50 chunks, with `model_id` and `voice_id` set per chunk).
3. If transitions are enabled (`--sfx on`, ≥2 chunks, and `ffmpeg` is available), also call `quote_tool` for `elevenlabs:v1.sound-generation` (`text: "subtle whoosh chime transition"`, `duration_seconds: 2`).
4. **Always share the character count and exact quoted USD cost from `quote_tool` with the user before generating the audio**, and note that only Agensi catalog voices are used (no voice cloning). Follow `quote_tool`'s `next_step` (`ask_first` waits for explicit user approval; `runs_without_asking` runs once you've presented the estimate or if the user already approved).

### Step 2 — Run and assemble locally

1. Call `run_tool` for the quoted `elevenlabs:text-to-speech` request(s) (and `elevenlabs:v1.sound-generation` if quoted).
2. Download each returned `audio.download_link` MP3 to temporary local `.mp3` files.
3. Write a temporary `manifest.json` outside the skill folder:

```json
{
  "title": "Document title",
  "mode": "multi",
  "model": "eleven_v4",
  "sfxPath": "/tmp/sfx.mp3",
  "sections": [
    {
      "index": 0,
      "title": "Introduction",
      "type": "introduction",
      "voice": "Jessica",
      "voiceId": "cgSgspJ2msm6clMCkdW9",
      "characters": 142,
      "audioPath": "/tmp/sec-0.mp3"
    }
  ]
}
```

4. Run the local assembler (requires no `ELEVENLABS_API_KEY` and makes no network requests):

```bash
node narrate.mjs --assemble /absolute/path/manifest.json --mode multi --sfx on --out /absolute/path/podcast.mp3
```

5. Delete temporary downloaded clips and `manifest.json` after `--assemble` finishes.

## 5B. Run the script with your own key (Alternative / BYOK)

Use this path only when Agensi tools are unavailable or the user explicitly chooses their own `ELEVENLABS_API_KEY`.

Count the characters in every `text`. A safe credit estimate is 1 credit per character (`eleven_turbo_v2_5` costs about 0.5 to 1 credit per character). Add 200 credits when there are two or more sections and transitions stay on. The free plan includes 10,000 credits per month, and unused free credits do not roll over.

Tell the user the character count and the estimate in one sentence. If the estimate is above 5,000 credits, stop and ask before you run. Otherwise run.

| Mode | Who speaks |
| --- | --- |
| `multi` (default) | introduction: Jessica, code: Adam, warning: Antoni, steps: Bella |
| `single` | Jessica for every section |

| Section type | Voice | Public voice id |
| --- | --- | --- |
| introduction | Jessica | `cgSgspJ2msm6clMCkdW9` |
| code | Adam | `pNInz6obpgDQGcFmaJgB` |
| warning | Antoni | `ErXwobaYiN019PkySvjV` |
| steps | Bella | `EXAVITQu4vr4xnSDxMaL` |

Model `eleven_turbo_v2_5`, output `mp3_44100_128`. The script retries each section once, then stops. Pass an absolute `--out` path in the user's project:

```bash
node narrate.mjs /absolute/path/sections.json --mode multi --sfx on --out /absolute/path/podcast.mp3
```

## Assembly output

Both `--assemble` and BYOK mode print the MP3 path, the timeline path, the mode, how the audio was joined, the character count, and each section as `start ms | type | voice | title`. The timeline file sits beside the MP3 and is named `<basename>.timeline.json`. `startMs` is estimated from MP3 size at 128 kbps (16,000 bytes per second).

`Assembly: ffmpeg` means `ffmpeg` joined the parts (and re-encoded them to mono so stereo transition sounds play cleanly). `Assembly: bytes` means `ffmpeg` was missing or could not join, so MP3 frames were appended and transition sounds were omitted. `Assembly: single` means there was only one audio piece. If the join was `bytes`, tell the user that installing `ffmpeg` from their operating system package manager enables transition sounds and cleaner joins.

## 6. Report the result

Tell the user:

- Which path was used (Agensi balance with actual USD charged, or BYOK `ELEVENLABS_API_KEY`)
- The absolute MP3 path and the absolute timeline path (plus the signed `download_link` if Agensi tools returned one for a single clip)
- The mode and whether a transition was included
- The source language
- The character count and the quoted USD cost / actual USD charged (or credit estimate in BYOK mode)
- Each section's title, voice name, and start time as minutes and seconds

Then stop. Do not upload the MP3 yourself, do not host a player, and do not start a second copy of the script for the same document.

If a step exits with an error, show that error and do not claim an audio file exists. In BYOK mode, HTTP 401 means the key was rejected and HTTP 429 means the account is rate limited or out of credits. In Agensi mode, if the balance does not cover the quote, show the top-up link returned by `quote_tool`.

## Where this skill stops

- It does not upload the finished local MP3 to Agensi, GitHub, cloud storage, or a website (Agensi's own `elevenlabs:text-to-speech` stores individual clip outputs for 7 days by design).
- It does not host a player, issue a share page, or keep a DocuVoice session.
- It does not add background music.
- It does not translate.
- It does not clone voices (Agensi mode uses only ElevenLabs catalog voices from `elevenlabs:voices`).
- It does not create an ElevenLabs account.
- Each run is independent. Nothing is stored for the next run except the files written by `--out`.

## Cost and limits

- **Agensi mode (primary):**
  - `elevenlabs:text-to-speech`: `$0.052` per 1,000 characters (`eleven_v4`, billed per character; `eleven_v4_turbo` and `eleven_flash_v2_5` are half price). Paid in USD from your Agensi balance; failed calls cost nothing.
  - `elevenlabs:v1.sound-generation`: `$0.156` per minute (`duration_seconds: 2` ≈ `$0.0052` once per run when transitions are on).
  - `elevenlabs:voices`: Free.
  - Tool cap: **5,000 characters** per `elevenlabs:text-to-speech` call. Longer scripts must be split into chunks ≤ 5,000 characters.
- **BYOK mode (alternative):**
  - Free ElevenLabs plan: 10,000 credits per month, no rollover.
  - Speech: budget 1 credit per spoken character (`eleven_turbo_v2_5` is about 0.5 to 1).
  - Transition: about 200 credits for the one clip, only when requested.
  - Model cap: 40,000 characters per request (keep sections ≤ 5,000 characters so they remain compatible with both modes).
- At most 50 sections/chunks per run.

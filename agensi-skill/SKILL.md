---
name: "DocuVoice: README to Podcast"
description: "Narrate a GitHub README, Markdown file, or pasted documentation as a local MP3 podcast. Classifies sections as introduction, code, warning, or steps, speaks them with ElevenLabs in one voice or four, and writes the audio plus a timeline. Use it when someone wants documentation read aloud. It does not upload or host the audio."
summary: "Turns a README or Markdown document into a local multi-voice MP3. Classifies sections, narrates them with ElevenLabs, and writes an MP3 plus a timeline. Does not host or upload the audio."
version: "1.0.0"
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
  - "Turn a GitHub README into a podcast you can listen to offline"
  - "Narrate a Markdown guide with different voices for code, warnings, and steps"
  - "Make a short audio briefing from pasted release notes"
  - "Preview how a tutorial sounds before recording a human voiceover"
  - "Produce a local MP3 and a section timeline from documentation"
  - "Choose one narrator or four voices for the same document"
docs_url: "https://github.com/pablomg-dev/docu-voice"
---

# DocuVoice: README to Podcast

Turn a README or other Markdown document into a local MP3 podcast. You prepare a sections JSON file, then run `scripts/narrate.mjs` with Node.js 18 or newer. The script calls ElevenLabs and writes the audio on the machine where it runs.

You do the reading, splitting, and rewriting. The script only speaks the JSON you give it. It is self-contained: voice ids, the model id, and the transition prompt are embedded in it. Do not expect the script to open `SKILL.md`, this folder's other files, or a `.env` file. If your runtime copies the script to a temporary file, run that copy unchanged.

`examples/sample-sections.json` shows the JSON shape. Write the user's file somewhere you can keep, not inside this skill folder.

## Permissions & data

This skill narrates text the user already asked to hear. It is not a collector.

The script reads one environment variable, `ELEVENLABS_API_KEY`. That value is sent only as the HTTP header `xi-api-key` on requests to `https://api.elevenlabs.io`. It is not placed in the URL, the MP3, the timeline, or any other file. No other environment variable is read.

The script reads one local document: the sections JSON path you pass as the argument. It must parse as the sections JSON described below. If it does not, the script stops and sends nothing. The only field sent to ElevenLabs is each section's `text`, as the body of speech synthesis. Titles, types, and the timeline stay on disk. The section type is used only to choose a public premade voice id from the map embedded in the script.

When a transition is needed, the script also sends the fixed phrase `subtle whoosh chime transition` and a duration of 2 seconds to sound generation. That phrase is not user data.

Network hosts:

- `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}?output_format=mp3_44100_128` with JSON `{"text":"<section text>","model_id":"eleven_turbo_v2_5"}`
- `POST https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128` with JSON `{"text":"subtle whoosh chime transition","duration_seconds":2}`

The script refuses redirects, so the API key is not forwarded to another host. It does not upload the finished MP3. It does not host a player, open a session, or call any other service. Temporary audio pieces live under the system temp directory and are removed after the MP3 is written. When `ffmpeg` is on `PATH`, the script starts it with Node's `execFile` and a fixed argument list.

The four voice ids in the script (`cgSgspJ2msm6clMCkdW9`, `pNInz6obpgDQGcFmaJgB`, `ErXwobaYiN019PkySvjV`, `EXAVITQu4vr4xnSDxMaL`) are public ElevenLabs premade voices (Jessica, Adam, Antoni, Bella). They are not account credentials.

Ask the user for an ElevenLabs API key only when `ELEVENLABS_API_KEY` is missing. Pass it solely as that environment variable on the Node process. Keep the key out of the sections file, the timeline, the command arguments, and your reply. Say that narration uses their ElevenLabs account, without repeating the key.

## What you need

- Node.js 18 or newer (`node` on `PATH`)
- `ELEVENLABS_API_KEY` for the Node process
- Optional: `ffmpeg` on `PATH` for a cleaner join between sections

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
5. Do not split a heading's body into several sections unless the spoken text would exceed 5,000 characters. When you split, keep the same type and title the parts `Install, part 2`, and so on. Stay at 50 sections or fewer.

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

Narrate in that language either way. When the document is Spanish, tell the user: "This document appears to be in Spanish. The selected voices are English-trained and may sound unnatural. Consider using Single Voice mode for better results." Then still speak Spanish. If the user wants one narrator, run with `--mode single`. If the heuristic fired on English, narrate in English and do not claim the document is Spanish.

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

`type` is exactly `introduction`, `code`, `warning`, or `steps`. `text` is the speakable narration and must be non-empty. `index` may be omitted. `title` may be omitted and then defaults to `Section N`. The document `title` is optional. Do not add a voice id; the script assigns one from the type and the mode. Keep each `text` at or under 5,000 characters, and never above 40,000.

Write this file outside the skill folder. Remember the absolute path.

## 5. Run the script

Count the characters in every `text`. A safe credit estimate is 1 credit per character. `eleven_turbo_v2_5` on the API costs about 0.5 to 1 credit per character. Add 200 credits when there are two or more sections and transitions stay on (one sound-effect generation, reused between sections). The free plan includes 10,000 credits per month, and unused free credits do not roll over.

Tell the user the character count and the estimate in one sentence. If the estimate is above 5,000 credits, stop and ask before you run. Otherwise run.

Default mode is multi-voice. Use `--mode single` when the user wants one narrator. Default transitions are on. Use `--sfx off` when the user does not want them.

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

Model `eleven_turbo_v2_5`, output `mp3_44100_128`. The script retries each section once, then stops. Sections are spoken one after another. A transition is requested only when `--sfx on` and there are at least two sections. If that request fails, the script skips the transition and still writes the podcast.

Pass an absolute `--out` path in the user's project. Do not write the MP3 next to the temporary copy of the script; that directory is removed after the run.

```bash
node narrate.mjs /absolute/path/sections.json --mode multi --sfx on --out /absolute/path/podcast.mp3
```

The script prints the MP3 path, the timeline path, the mode, how the audio was joined, the character count, and each section as `start ms | type | voice | title`. The timeline file sits beside the MP3 and is named `<basename>.timeline.json`. Its `sections` array has `title`, `voice`, and `startMs`. `startMs` is estimated from MP3 size at 128 kbps (16,000 bytes per second), the same estimate DocuVoice uses. It is not a decoded duration.

`Assembly: ffmpeg` means `ffmpeg` joined the parts. `Assembly: bytes` means `ffmpeg` was missing or could not join, and the MP3 frames were appended. `Assembly: single` means there was only one audio piece. If the join was `bytes`, tell the user that installing `ffmpeg` from their operating system package manager makes later joins cleaner.

## 6. Report the result

Tell the user:

- The absolute MP3 path and the absolute timeline path
- The mode and whether a transition was included
- The source language
- The character count and the credit estimate you used
- Each section's title, voice name, and start time as minutes and seconds

Then stop. Do not upload the MP3, do not host it, do not create a share link, and do not start a second copy of the script for the same document.

If the script exits with an error, show that error and do not claim an audio file exists. A missing key is reported before the JSON is read and before any request. HTTP 401 means the key was rejected. HTTP 429 means the account is rate limited or out of credits.

## Where this skill stops

- It does not upload the MP3 to Agensi, GitHub, cloud storage, or a website.
- It does not host a player, issue a link, or keep a DocuVoice session.
- It does not add background music.
- It does not translate.
- It does not create an ElevenLabs account.
- ElevenLabs receives the narration text in order to synthesize speech. That text leaves the machine. The finished MP3 does not.
- Each run is independent. Nothing is stored for the next run except the files written by `--out`.

## Cost and limits

- Free plan: 10,000 credits per month, no rollover.
- Speech: budget 1 credit per spoken character (the turbo v2.5 API rate is about 0.5 to 1).
- Transition: about 200 credits for the one clip, only when it is actually requested.
- Model cap: 40,000 characters per request. Keep each section under 5,000 characters.
- At most 50 sections per run.
- The script stops on the first section that still fails after one retry. It does not skip a failed section.

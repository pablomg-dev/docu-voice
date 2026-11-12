# DocuVoice: README to Podcast

Agensi marketplace skill derived from [DocuVoice](https://github.com/pablomg-dev/docu-voice). A buyer's agent follows `SKILL.md`: it turns a README or other Markdown into sections, then runs `scripts/narrate.mjs` to synthesize a local MP3 with ElevenLabs.

This folder is the skill package. It does not run the Next.js app.

## Layout

```text
SKILL.md
README.md
.env.example
scripts/narrate.mjs
examples/sample-sections.json
```

`SKILL.md` is the agent instructions. `scripts/narrate.mjs` is a Node 18+ script with no dependencies. Voice ids, the speech model, and the transition prompt are embedded in that script because a buyer's agent runs each script from its own temporary file.

## Requirements

- Node.js 18 or newer
- An ElevenLabs API key in the environment variable `ELEVENLABS_API_KEY`
- `ffmpeg` on `PATH` is optional. Without it, the script appends MP3 bytes directly.

Copy `.env.example` only as a reminder of the variable name. The script does not read `.env` files. Put the key in the environment of the Node process. The script sends that key only as the `xi-api-key` header to `https://api.elevenlabs.io`.

## Run the script

```bash
node scripts/narrate.mjs examples/sample-sections.json --mode multi --sfx on --out podcast.mp3
```

The command writes `podcast.mp3` and `podcast.timeline.json` in the current directory. `--mode` is `single` or `multi` (default `multi`). `--sfx` is `on` or `off` (default `on`). Timestamps in the timeline are estimated from MP3 size at 128 kbps.

Check syntax without calling the API:

```bash
node --check scripts/narrate.mjs
```

If `ELEVENLABS_API_KEY` is missing, the script exits with an error before it reads the JSON and before any network call.

## Package a ZIP for Agensi

From this folder, so `SKILL.md` is at the top of the archive:

```bash
cd agensi-skill && zip -r ../docuvoice-skill.zip .
```

Do not add `node_modules`. The script has no packages to install. Do not put an API key in the ZIP.

## What it does not do

The skill does not upload the MP3, host a player, or store a session. Audio stays on the machine where the script runs. Details of the network call and the files that are read are in the "Permissions & data" section of `SKILL.md`.

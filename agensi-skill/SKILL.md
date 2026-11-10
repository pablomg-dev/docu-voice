---
name: docu-voice
description: Turns one public GitHub README URL into a single spoken MP3. Speech comes from an ElevenLabs voice tool discovered with Agensi find_tools, after quote_tool and an explicit buyer approval. FFmpeg on the buyer machine joins the chunks. One voice per run.
summary: Public GitHub README in, one MP3 out, via a quoted Agensi voice tool and local FFmpeg.
version: 0.1.0
tags: elevenlabs, tts, readme, ffmpeg
keywords: docu-voice, readme to audio, single voice
use_cases: Turn a public GitHub README into a short single-voice spoken walkthrough.
docs_url: https://github.com/pablomg-dev/docu-voice
---

# docu-voice (PoC v0.1)

Given one public GitHub README URL, produce one MP3. Use a single voice. Do not claim multi-voice, sound effects, music, or a price other than the figure `quote_tool` returns for this run.

## Requirements

- Python 3 on PATH.
- `ffmpeg` and `ffprobe` on PATH. FFmpeg is a local requirement. Agensi does not provide it.
- Agensi MCP signed in, so `find_tools`, `quote_tool`, `run_tool`, and `check_job` are available. Documented at https://www.agensi.io/docs/tools.
- Do not ask the buyer for `ELEVENLABS_API_KEY` or any other provider key. Agensi runs voice tools on its own accounts.

## Work directory

Create a fresh directory and keep every file you write inside it. Do not modify the buyer's project.

```bash
WORK=$(mktemp -d "${TMPDIR:-/tmp}/docu-voice-XXXXXX")
```

Run the skill scripts unchanged, as shipped. Do not retype them. In a local checkout they live next to this file under `scripts/`.

## 1. Fetch the README

```bash
python3 fetch_readme.py --url "$URL" --out "$WORK/readme.md"
```

Accepted URLs are https only, with no credentials:

- `https://github.com/owner/repo`
- `https://github.com/owner/repo/blob/<ref>/README.md` (ref is one segment, no slash)
- `https://raw.githubusercontent.com/owner/repo/<ref>/README.md`

The script caps the body at 512 KiB, follows redirects only across public GitHub hosts, and refuses to write outside the system temp directory. A bare repo URL tries `raw.githubusercontent.com/.../HEAD/README.md` and, only on HTTP 404, the public GitHub README API. No token is sent.

If the script prints `"ok": false`, stop and show `error` and `message`. Do not invent a second fetch path.

## 2. Build the spoken script

```bash
python3 build_script.py --input "$WORK/readme.md" --out "$WORK/script.json" --source-url "$URL"
```

The script keeps at most 5 sections and 1800 spoken characters. It drops license, contributing, and changelog sections, and it does not read code blocks or tables aloud. `voice_mode` is `single`.

Show the buyer each section title and `chars` before any paid call. If the script is too short, stop.

## 3. Discover the voice tool

Do not hardcode a tool id, provider slug, or parameter name.

1. Call `find_tools` and search for ElevenLabs text-to-speech.
2. Choose a result that is ElevenLabs and is text-to-speech. If none is, stop. Do not switch vendor and do not ask for an API key.
3. Call `find_tools` again with that tool id so you have its parameters and price. Use only parameter names that response lists.
4. Map each section `text` onto the text parameter from that response. Use one voice for every section. If a voice parameter exists, pick one value and reuse it. If it does not, leave the tool default. Do not make a second call to change voice.

`skill_tools` can show tools already attached to a live skill. This PoC is not a live listing, so do not invent a `skill_slug`.

## 4. Quote, then wait

Call `quote_tool` for one use per section (the section count is at most 5, under the documented cap of 100). Omit `skill_slug` so the tool is quoted directly. Docs: nothing is charged at quote time, and a shown price is valid for 10 minutes.

Show the quote. Wait for an explicit yes. If the buyer says no, or the quote is missing, stop. Delete the work directory with `cleanup_work_dir.py` and do not invent a price.

This quote is the only pre-run price this skill shows. The PoC did not execute `quote_tool`; see `references/limitations.md`.

## 5. Synthesize

For each section, in index order, call `run_tool` with the approved quote and the parameters from step 3. If the response is a job, call `check_job` until it finishes.

Documented file handoff (https://www.agensi.io/docs/tools and https://www.agensi.io/docs/credits): the result is a link that lasts 7 days and also appears in Dashboard → Balance for 30 days. A local filesystem path is not documented.

- If you receive an https link, download it only into the work directory:

```bash
python3 download_audio.py --url "$LINK" --out "$WORK/chunk-01.mp3"
```

Use `chunk-02.mp3` and so on, matching section index. The script accepts public https only, caps the body at 20 MB, and rejects files that are not recognizable audio.

- If you receive a readable local audio file, copy that file into `$WORK/chunk-NN.mp3`. Do not leave the only copy outside the work directory.
- If you receive neither a public https link nor a readable local audio file, stop. Tell the buyer: Agensi produced audio, but this session cannot read it, so FFmpeg cannot join it. Viable alternative: the buyer downloads each file from the 7-day link or from Dashboard → Balance into `$WORK` using the chunk names above, then you run the concat step. Do not claim a finished MP3 before those local files exist.

Do not run `tests/simulate_tts.py`. That file is a maintainer simulator. It is not ElevenLabs and it is not an Agensi tool.

## 6. Assemble with local FFmpeg

Pass the chunk paths in index order. Do not rely on a shell glob.

```bash
bash concat_mp3.sh "$WORK/docu-voice.mp3" "$WORK/chunk-01.mp3" "$WORK/chunk-02.mp3"
```

The script rejects missing files, empty files, files without an audio stream, symlink outputs, and an output that already exists. It re-encodes to a mono 44.1 kHz MP3 so chunks with different sample rates still join. Paths are argv, so spaces and quotes in names are preserved.

## 7. Deliver and clean up

Tell the buyer the absolute path of `$WORK/docu-voice.mp3`. Do not copy it into their project unless they give an explicit destination.

Fill in `templates/delivery-note.md`: source URL, section titles, character counts, the tool id returned by `find_tools`, the quote, how many `run_tool` calls succeeded, and the MP3 path.

After the buyer has the file, remove the work directory:

```bash
python3 cleanup_work_dir.py --dir "$WORK"
```

That script only removes a real directory under temp whose name starts with `docu-voice-`.

## Hard rules

- Never hardcode API keys, tokens, or Authorization headers.
- Do not bundle dependencies. These scripts use Python 3, bash, ffmpeg, and ffprobe only.
- Each script runs on its own. It cannot read sibling files. Pass every path as an argument.
- Do not change, delete, or overwrite files in the buyer's project. Outputs stay in the work directory unless the buyer names a destination.
- One voice for the whole run.
- Do not add music or sound effects.
- Do not invent Agensi tool ids, parameter names, or prices.

## Out of scope

The Next.js DocuVoice web app stays unchanged. This skill does not host audio, take payment for the skill itself, or match the web app's sound effects.

# Limitations (PoC v0.1)

Checked against public Agensi docs on 2026-11-10:

- https://www.agensi.io/docs/tools
- https://www.agensi.io/docs/credits
- https://www.agensi.io/docs/packaging
- https://www.agensi.io/docs/how-agents-load-skills

The validation environment had no signed-in Agensi MCP session. Nothing in this PoC called `find_tools`, `quote_tool`, `run_tool`, or `check_job`.

## Not claimed

- Multi-voice in one run. The script sets `voice_mode` to `single` and the agent reuses one voice. A second voice is out of scope until a live run shows that the chosen tool accepts it.
- Sound effects and music. ElevenLabs Music was mentioned by Agensi as available on their keys. This skill does not call it.
- A cost estimate beyond `quote_tool`. That call is the documented pre-run price (nothing is charged, the figure lasts 10 minutes, up to 100 uses of one tool). This PoC did not execute it, so the skill stops when the quote is missing instead of guessing.
- A specific ElevenLabs tool id or parameter names such as `voice_id`. Those were not published on the tools reference page. The agent must read them from `find_tools`.
- A `skill_slug`. The skill is not a live listing. `quote_tool` is called without `skill_slug`, which the docs describe as using a tool directly.

## Audio files

Documented output is a link that lasts 7 days and a copy in Dashboard → Balance for 30 days. A local path is not documented.

`scripts/download_audio.py` is the handoff for a public https link: size cap, public-address check, and an audio magic-byte check, writing only under temp. If a run returns neither a link nor a readable file, the agent stops. The buyer can download the Balance-tab files into the work directory and the same FFmpeg step can join them. That fallback was not exercised against a live Agensi file.

## README input

- Public GitHub https URLs only. No credentials, no non-GitHub hosts.
- Repository root README, or a README file whose git ref is a single path segment.
- 512 KiB maximum.
- Spoken script: at most 5 sections, 480 characters each, 1800 total, at least 80 or the run stops.
- Code fences and tables are omitted from the narration. License, contributing, and changelog headings are skipped.
- Unauthenticated GitHub requests are subject to GitHub's public rate limit. The script sends no token.

## Local assembly

- Requires `ffmpeg`, `ffprobe`, Python 3, and bash on the buyer machine.
- `concat_mp3.sh` re-encodes to mono 44.1 kHz MP3 and will not overwrite an existing output file.
- Outputs stay in a `docu-voice-*` temp directory unless the buyer names a destination.

## Demo MP3 in this pull request

`examples/demo-simulated.mp3` is espeak-ng speech of a real public README script, joined by the real FFmpeg script. It is not an Agensi render and not an ElevenLabs render. Do not upload it as a voice sample.

## Web app

The Next.js DocuVoice app is unchanged. This skill does not share its server, session store, or ElevenLabs key.

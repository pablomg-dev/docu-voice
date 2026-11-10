---
name: docu-voice
description: Turns a GitHub README URL into a multi-voice audio walkthrough. Uses Agensi ElevenLabs tools for TTS (and music when available); assembles the final MP3 locally with FFmpeg.
summary: README URL in, podcast-style audio out, via Agensi ElevenLabs tools plus local FFmpeg.
version: 0.1.0-poc
tags: elevenlabs, tts, readme, podcast, ffmpeg
keywords: docu-voice, readme to audio, multi-voice
use_cases: Turn open-source READMEs into short spoken walkthroughs for agents and developers.
docs_url: https://github.com/pablomg-dev/docu-voice
---

# docu-voice (PoC)

## Goal
Given a public GitHub README URL, produce a short multi-section spoken walkthrough as one MP3.

## Requirements (buyer machine)
- FFmpeg installed and on PATH (Agensi does not provide FFmpeg; list it as a local requirement).
- Agensi ElevenLabs tools available on Agensi keys (buyer approves pay-per-use price per call; no buyer ElevenLabs account needed).
- Network access only to fetch the README and call Agensi ElevenLabs tools.

## Confirmed by Agensi (Joeri, 2026-11-09)
- Skills can call ElevenLabs through Agensi on Agensi keys.
- ElevenLabs Music is among the tools on those keys.
- Tool calls are pay-per-use, approved by the buyer, separate from the skill purchase.
- FFmpeg is not provided by Agensi; document it as a local requirement.
- Listing is non-exclusive; the standalone DocuVoice web app can stay unchanged.

## Not confirmed yet (PoC must validate)
- Multiple ElevenLabs tool calls in one run with different voices per section.
- Local access to generated audio files so FFmpeg can concatenate them.
- Pre-run cost estimate for tool usage.
- Sound effects tooling parity with the web app.

## Workflow (PoC v0)
1. Fetch the README markdown from the URL the user gives.
2. Split it into short spoken sections (title, overview, setup, usage, caveats). Cap total spoken length so a first run stays cheap.
3. For each section, call Agensi ElevenLabs TTS. Prefer one stable voice for v0 if multi-voice per run is not confirmed; try a second voice only if the tool layer clearly supports it in the same run.
4. Save each audio chunk to a local temp path the agent can read.
5. Run a local FFmpeg concat (see `scripts/concat_mp3.sh`) into `output/docu-voice.mp3`.
6. Report the output path and roughly how many TTS calls were used.

## Hard rules
- Never hardcode API keys or tokens.
- Do not bundle node_modules or other dependencies in the skill ZIP.
- Keep each script under 20 KB and self-contained (scripts run from a temp file and cannot read sibling package files).
- Do not change the buyer's unrelated project files.

## Out of scope for PoC
- Full parity with the Next.js DocuVoice web app.
- Subscriptions, branding UI, or hosting audio for the buyer.

# Public README run (2026-11-10)

This is a maintainer run from `tests/run_simulated_demo.sh`. It is not a buyer session.

| Step | Kind | Result |
| --- | --- | --- |
| Fetch `https://github.com/pablomg-dev/docu-voice` | Real network | HTTP 200, 861 bytes |
| Resolved URL | Real | `https://raw.githubusercontent.com/pablomg-dev/docu-voice/HEAD/README.md` |
| Spoken script | Real local script | 5 sections, 652 spoken characters, `voice_mode` single |
| Speech | Simulated | espeak-ng (`DOCUVOICE_SIMULATED_TTS=1`) |
| Assembly | Real FFmpeg | `examples/demo-simulated.mp3` |
| Agensi `find_tools` / `quote_tool` / `run_tool` / `check_job` | Not run | No signed-in Agensi MCP in this environment |

ffprobe of the MP3:

```text
format_name=mp3
duration=52.114286
size=554905
```

The source README says "multi-voice" and "different voices per section type". Those words are in the narration because they are in the README. The render still used one espeak-ng voice for every chunk. That does not validate multi-voice on Agensi.

`ELEVENLABS_API_KEY` appears only inside a fenced command in the README. It is not in the spoken script.

## Sections

1. intro, DocuVoice, 144 chars. "DocuVoice. Turn any documentation into a multi-voice audio podcast. Built with Kiro spec-driven development + ElevenLabs APIs for ElevenHacks 5."
2. overview, What it does, 131 chars. "What it does. Paste any GitHub README URL and DocuVoice generates a navigable audio podcast with different voices per section type."
3. other, Tech Stack, 109 chars. "Tech Stack. Next.js 16 + TypeScript. ElevenLabs TTS, Sound Effects and Music APIs. ffmpeg for audio assembly."
4. other, Run locally, 57 chars. "Run locally. Code samples are left out of this narration."
5. other, Built with Kiro spec-driven development, 211 chars. "Built with Kiro spec-driven development. Requirements, design and tasks were all defined as specs first, then implemented by Kiro's AI agent. See .kiro/specs/ for the full specification. ElevenHacks CodeWithKiro"

The full JSON is `examples/demo-script.json`.

## File handoff

Not observed against Agensi. The documented tool result is a 7-day link, also listed in Dashboard → Balance for 30 days. `scripts/download_audio.py` is the local step for that link. If a live response has neither a public https URL nor a readable file, stop and ask the buyer to save the Balance files into the work directory before FFmpeg.

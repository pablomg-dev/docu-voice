# DocuVoice Agensi skill (PoC v0.1)

Agent skill that turns one public GitHub README into a single MP3. Speech is an ElevenLabs voice tool on Agensi, quoted and approved before it runs. FFmpeg on the buyer machine joins the chunks. The Next.js app in this repository is not part of the skill and is not modified.

This checkout is a local review copy. Agensi delivers `SKILL.md` plus the other text files to a signed-in agent. You do not install the skill into the web app.

## What you need locally

- Python 3.9 or newer
- `ffmpeg` and `ffprobe` on `PATH` (local requirement; Agensi does not ship FFmpeg)
- For a buyer run: an agent signed in to Agensi MCP (`https://mcp.agensi.io/mcp/auth`). The buyer approves the `quote_tool` price from their Agensi balance. Do not set `ELEVENLABS_API_KEY`.

## Files

| Path | Role |
| --- | --- |
| `SKILL.md` | Instructions the agent follows |
| `references/agensi-constraints.md` | Business notes and the documented tool contract |
| `references/limitations.md` | What this PoC does not claim |
| `scripts/fetch_readme.py` | Validate a GitHub URL and save the README under temp |
| `scripts/build_script.py` | Split the README into a short single-voice script |
| `scripts/download_audio.py` | Save a public https audio link into the work directory |
| `scripts/concat_mp3.sh` | Assemble local audio files into one MP3 |
| `scripts/cleanup_work_dir.py` | Delete only a `docu-voice-*` temp directory |
| `templates/delivery-note.md` | Report the agent fills in after a run |
| `tests/` | Maintainer tests. Simulated speech is marked and is not a buyer step |
| `examples/` | Review artifacts from one public README. The MP3 voice is simulated |

## Buyer flow

The agent reads `SKILL.md` and then:

1. Saves the README in a fresh `/tmp/docu-voice-*` directory.
2. Builds a script of at most 5 sections and 1800 spoken characters.
3. Uses `find_tools` to locate an ElevenLabs text-to-speech tool. Tool ids are not hardcoded.
4. Shows `quote_tool` and waits for a yes.
5. Runs `run_tool` once per section, with one voice.
6. Downloads the documented 7-day file link into the work directory, or asks the buyer to save the Balance-tab files there if no local file is available.
7. Runs `concat_mp3.sh` and returns the MP3 path.

## Maintainer checks

From this directory:

```bash
python3 -m unittest discover -s tests -t . -v
```

The live test fetches `https://github.com/octocat/Hello-World`. It does not call Agensi.

Simulated end-to-end demo (real README fetch, real FFmpeg, espeak-ng instead of Agensi):

```bash
bash tests/run_simulated_demo.sh "https://github.com/pablomg-dev/docu-voice"
```

The script prints `SIMULATED VOICE` and refuses to synthesize unless `DOCUVOICE_SIMULATED_TTS=1`, which the demo script sets itself. Do not use that voice as a sample of ElevenLabs.

## Packaging note

A future Agensi ZIP should contain `SKILL.md`, `references/`, `scripts/`, and `templates/`. Leave out `tests/`, `examples/`, and `reports/`. The demo MP3 is review evidence for this pull request, and Agensi serves text files to agents.

## Limits

See `references/limitations.md`. Short version: one voice, no sound effects, no invented tool names, FFmpeg stays local, and local access to Agensi audio is implemented as "download the documented link" because a live `run_tool` response was not available in this PoC.

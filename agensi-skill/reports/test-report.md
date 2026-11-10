# Test report (2026-11-10)

Command, from `agensi-skill/`:

```bash
python3 -m unittest discover -s tests -t . -v
```

Result: **29 tests, OK**, about 1.9 seconds. Log: `reports/unittest.txt`.

No test called Agensi. No test used an ElevenLabs API key.

## Real

| Check | Where | What happened |
| --- | --- | --- |
| Public README fetch | `tests/test_fetch_readme_live.py` | GET `https://github.com/octocat/Hello-World`. Non-empty text, not HTML. |
| Public README used for the demo | `examples/public-readme-run.md` | GET `https://github.com/pablomg-dev/docu-voice`, 861 bytes from raw GitHub. |
| FFmpeg assembly | `tests/test_concat_and_cleanup.py` | Two generated tones, including a filename with a space and a quote, became one MP3. ffprobe duration at least 0.7 s. |
| Valid MP3 after a full local pipeline | `tests/test_pipeline_simulated.py` and the demo MP3 | ffprobe reports `mp3` and a positive duration. Demo file is 52.114286 s, 554905 bytes. |

## Simulated (not Agensi)

| Check | Stand-in | Guard |
| --- | --- | --- |
| URL and HTTP failures for fetch | In-process fake transport | No socket |
| Audio download, private hosts, HTML body, oversize | Fake transport and fake DNS | No socket |
| TTS | `tests/simulate_tts.py` via espeak-ng, or a tone if espeak-ng is missing | Refuses to start unless `DOCUVOICE_SIMULATED_TTS=1`. Manifest says `agensi: false` and `elevenlabs: false`. |

## Error paths covered

- Non-https URL, credentials in the URL, non-GitHub host, non-README blob path.
- HTTP 503, HTML body, empty body, body over 512 KiB.
- Output path outside the temp directory.
- README too short to narrate, and a section cut at the character cap.
- Code fence contents (including a fake token string) left out of the script.
- Missing audio input, non-audio file, refusing to overwrite an existing MP3, missing ffmpeg (exit 3).
- Download of HTML, oversize audio, HTTP 404, and a redirect target on 127.0.0.1.
- Cleanup refuses `/tmp` itself and refuses the skill directory. It removes only a `docu-voice-*` temp directory.
- Simulator refuses to run without the maintainer flag.

## Not executed

`find_tools`, `quote_tool`, `run_tool`, and `check_job` were not called. Multi-voice, sound effects, and a live pre-run quote were not measured. See `references/limitations.md`.

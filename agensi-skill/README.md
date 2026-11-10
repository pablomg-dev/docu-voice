# DocuVoice → Agensi skill (PoC scaffold)

Local draft for packaging DocuVoice as an Agensi agent skill.

- `SKILL.md` - agent instructions + listing frontmatter
- `references/agensi-constraints.md` - business and technical notes from Joeri + Agensi docs
- `scripts/concat_mp3.sh` - local FFmpeg concat helper (buyer must have FFmpeg)

Source app: https://github.com/pablomg-dev/docu-voice

Next step: implement a thin agent flow that fetches a README, calls Agensi ElevenLabs TTS, concatenates with FFmpeg, and returns one MP3. Keep the Next.js web app unchanged.

# DocuVoice 🎙️

> Turn any documentation into a multi-voice audio podcast.

Built with [Kiro](https://kiro.dev) spec-driven development + [ElevenLabs](https://elevenlabs.io) APIs for **ElevenHacks #5**.

## Demo
[Live Demo](#) | [Watch Video](#)

## What it does
Paste any GitHub README URL and DocuVoice generates a navigable audio podcast with different voices per section type.

## Tech Stack
- Next.js 16 + TypeScript
- ElevenLabs TTS, Sound Effects & Music APIs
- ffmpeg for audio assembly

## Run locally
cd docuvoice
npm install
echo "ELEVENLABS_API_KEY=your_key" > .env.local
npm run dev
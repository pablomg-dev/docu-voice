# DocuVoice 🎙️

> Turn any documentation into a multi-voice audio podcast.

Built with [Kiro](https://kiro.dev) spec-driven development + [ElevenLabs](https://elevenlabs.io) APIs for **ElevenHacks #5**.

## Demo
[🚀 Live Demo](https://docu-voice-liart.vercel.app/) | [Watch Video](#)

## What it does
Paste any GitHub README URL and DocuVoice generates a navigable audio podcast with different voices per section type.

## Tech Stack
- Next.js 16 + TypeScript
- ElevenLabs TTS, Sound Effects & Music APIs
- ffmpeg for audio assembly

## Run locally
```bash
cd docuvoice
npm install
echo "ELEVENLABS_API_KEY=your_key" > .env.local
npm run dev
```

## Built with Kiro spec-driven development

Requirements, design and tasks were all defined as specs first, then implemented by Kiro's AI agent. See `.kiro/specs/` for the full specification.

---

*#ElevenHacks #CodeWithKiro*

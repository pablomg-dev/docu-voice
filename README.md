# DocuVoice 🎙️

> Turn any documentation into a multi-voice audio podcast.

Built with [Kiro](https://kiro.dev) spec-driven development + [ElevenLabs](https://elevenlabs.io) APIs for **ElevenHacks #5**.

## What it does

Paste any GitHub README URL and DocuVoice generates a navigable
audio podcast with different voices per section type:

- 🎤 **Intro sections** — calm narrator voice
- 💻 **Code blocks** — technical voice
- ⚠️ **Warnings** — serious voice
- 📋 **Steps** — clear instructional voice

## Run locally

```bash
cd docuvoice
npm install
cp .env.local .env.local  # add your ELEVENLABS_API_KEY
npm run dev
```

## Built with Kiro spec-driven development

Requirements, design and tasks were all defined as specs first,
then implemented by Kiro's AI agent. See `.kiro/specs/` for the
full specification used to build this project.

## Tech Stack

- Next.js 16 + TypeScript + Tailwind CSS
- ElevenLabs TTS + Sound Effects APIs
- ffmpeg for audio assembly
- Kiro for spec-driven development

---

_ElevenHacks #5 — #ElevenHacks #CodeWithKiro_

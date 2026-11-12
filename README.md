# DocuVoice 🎙️

> Turn any documentation into a multi-voice audio podcast.

![TypeScript 5+](https://img.shields.io/badge/TypeScript-5%2B-3178C6?style=flat&logo=typescript&logoColor=white) ![Next.js 16+](https://img.shields.io/badge/Next.js-16%2B-000000?style=flat&logo=nextdotjs&logoColor=white) ![React 19+](https://img.shields.io/badge/React-19%2B-61DAFB?style=flat&logo=react&logoColor=black) ![Tailwind CSS 4+](https://img.shields.io/badge/Tailwind_CSS-4%2B-06B6D4?style=flat&logo=tailwindcss&logoColor=white) ![ElevenLabs Turbo v2.5](https://img.shields.io/badge/ElevenLabs-Turbo_v2.5-000000?style=flat&logo=elevenlabs&logoColor=white) ![Vercel](https://img.shields.io/badge/Vercel-Deploy-000000?style=flat&logo=vercel&logoColor=white) [![Live demo](https://img.shields.io/badge/Live_demo-Online-22c55e?style=flat)](https://docu-voice-nine.vercel.app/)

Built with [Kiro](https://kiro.dev) spec-driven development + [ElevenLabs](https://elevenlabs.io) APIs for **ElevenHacks #5**.

## Demo
[🚀 Live Demo](https://docu-voice-nine.vercel.app/)

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

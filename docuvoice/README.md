# DocuVoice — Documentation Narrator

Convert any technical documentation or README into a navigable audio podcast experience.

## Getting Started

### Prerequisites

- Node.js 18+
- An [ElevenLabs](https://elevenlabs.io) API key

### Environment Variables

Copy `.env.local` and fill in your key:

```bash
cp .env.local .env.local   # already created — just edit it
```

| Variable | Required | Description |
|---|---|---|
| `ELEVENLABS_API_KEY` | ✅ | Your ElevenLabs API key. The server will refuse to start without it. |

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Run Tests

```bash
npm test
```

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + React 19 + Tailwind CSS
- **Backend**: Next.js API Routes (secure ElevenLabs proxy)
- **Audio**: ElevenLabs TTS + Sound Effects + Music · fluent-ffmpeg for assembly
- **Parsing**: unified / remark / rehype pipeline
- **Testing**: Vitest + fast-check (property-based tests)

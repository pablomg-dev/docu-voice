# Agensi constraints for DocuVoice PoC

Source: email thread with Joeri Brons (Agensi), 2026-11-09, plus Agensi packaging docs.

## Business
- Creator share: 70% of every sale; Agensi covers payment fees and sales taxes as merchant of record.
- Payouts: Stripe where available, otherwise Zoneless (USDC on Solana within 72 hours). Free listings need no payout setup.
- Non-exclusive listing; standalone web app can remain.

## Packaging
- ZIP with SKILL.md at root (YAML frontmatter needs `name` and `description`).
- Text/code only for agent delivery; no executables; no bundled node_modules.
- Website upload up to 50 MB; scripts should stay under ~20 KB each and be self-contained.
- Submit via Creator Dashboard; automated security scan then manual review.
- Docs: https://www.agensi.io/docs/packaging and https://www.agensi.io/sell

## Technical posture for v0
- Prefer Agensi ElevenLabs tools over asking the buyer for ELEVENLABS_API_KEY.
- Require local FFmpeg explicitly in the listing compatibility note.
- Validate multi-voice, local file handoff, and cost preview before claiming them in the public listing.

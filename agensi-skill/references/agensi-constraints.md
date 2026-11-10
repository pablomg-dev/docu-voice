# Agensi constraints for DocuVoice PoC

Source: email thread with Joeri Brons (Agensi), 2026-11-09, plus the public docs linked below (read 2026-11-10).

## Business

- Creator share: 70% of every sale; Agensi covers payment fees and sales taxes as merchant of record.
- Payouts: Stripe where available, otherwise Zoneless (USDC on Solana within 72 hours). Free listings need no payout setup.
- Non-exclusive listing; the standalone web app can remain.
- Tool charges are separate from the skill price. Creators do not earn from tool use (Terms 4.8, as described on https://www.agensi.io/docs/credits).

## Packaging

- ZIP with `SKILL.md` at the root. Frontmatter needs `name` and `description`.
- Text and code only for what the agent runs. Scripts are copied to a temp file, run unchanged, and removed. A script cannot read sibling package files.
- Website upload up to 50 MB. Keep each script's logic under about 20 KB.
- No bundled `node_modules` or virtualenvs. No executable binaries of the blocked types (exe, dll, so, and the rest of the packaging list).
- Docs: https://www.agensi.io/docs/packaging and https://www.agensi.io/sell

## Tool contract this skill is allowed to use

Documented MCP tools (https://www.agensi.io/docs/tools), all of which require sign-in:

| Tool | Use in this skill |
| --- | --- |
| `find_tools` | Search voice tools, then load one tool id to read its parameters and price. |
| `quote_tool` | Exact price for one use per section before anything is charged. Omit `skill_slug` until the skill is live. |
| `run_tool` | Run only after the buyer approves the quote. Failed uses cost nothing. |
| `check_job` | Follow a slow job until the file link is ready. |
| `skill_tools` | Optional read of tools already attached to a live skill. Not used to invent ids. |

`set_skill_tools` is a creator action (at most 10 tools). This PoC does not call it and does not publish the skill.

File results are links that last 7 days and also sit in Dashboard → Balance for 30 days. Buyers do not need an ElevenLabs account or `ELEVENLABS_API_KEY`.

## Posture for v0.1

- One voice per run.
- FFmpeg stays a local requirement, stated in the listing.
- Do not advertise multi-voice, sound effects, or a price the agent did not get from `quote_tool`.
- Discover the ElevenLabs tool id at run time. Do not bake one into the skill.

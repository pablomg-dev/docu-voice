#!/usr/bin/env bash
# Maintainer-only demo. Fetches a real public README, builds the script, then
# uses SIMULATED speech (espeak-ng or a tone). It does not call Agensi.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: run_simulated_demo.sh <github-url> [dest.mp3]" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="$1"
DEST="${2:-}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/docu-voice-XXXXXX")"
export DOCUVOICE_SIMULATED_TTS=1

echo "SIMULATED VOICE. This is not an Agensi or ElevenLabs render."
echo "work=$WORK"

python3 "$ROOT/scripts/fetch_readme.py" --url "$URL" --out "$WORK/readme.md"
python3 "$ROOT/scripts/build_script.py" --input "$WORK/readme.md" --out "$WORK/script.json" --source-url "$URL"
python3 "$ROOT/tests/simulate_tts.py" --script "$WORK/script.json" --out-dir "$WORK/chunks" >"$WORK/simulated-manifest.json"

mapfile -t chunks < <(python3 - "$WORK/script.json" "$WORK/chunks" <<'PY'
import json, sys
from pathlib import Path
script = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
out = Path(sys.argv[2])
for section in script["sections"]:
    print(out / f"chunk-{int(section['index']):02d}.mp3")
PY
)

bash "$ROOT/scripts/concat_mp3.sh" "$WORK/docu-voice.mp3" "${chunks[@]}"
ffprobe -v error -show_entries format=format_name,duration,size -of default=nw=1 "$WORK/docu-voice.mp3"
echo "mp3=$WORK/docu-voice.mp3"
echo "script=$WORK/script.json"
echo "readme=$WORK/readme.md"

if [[ -n "$DEST" ]]; then
  cp -f -- "$WORK/docu-voice.mp3" "$DEST"
  echo "copied=$DEST"
fi

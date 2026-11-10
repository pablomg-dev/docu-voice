#!/usr/bin/env bash
# Self-contained FFmpeg concat helper for DocuVoice PoC.
# Usage: concat_mp3.sh <output.mp3> <chunk1.mp3> [chunk2.mp3 ...]
set -euo pipefail
if [ "$#" -lt 2 ]; then
  echo "usage: $0 <output.mp3> <chunk1.mp3> [chunk2.mp3 ...]" >&2
  exit 1
fi
out="$1"
shift
list="$(mktemp)"
trap 'rm -f "$list"' EXIT
for f in "$@"; do
  printf "file '%s'\n" "$(cd "$(dirname "$f")" && pwd)/$(basename "$f")" >> "$list"
done
ffmpeg -y -f concat -safe 0 -i "$list" -c copy "$out"
echo "$out"

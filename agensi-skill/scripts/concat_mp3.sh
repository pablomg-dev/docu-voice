#!/usr/bin/env bash
# Join one or more audio files into a single MP3.
# Paths are passed as argv (not a concat list) so quotes and spaces stay intact.
# Inputs are decoded, forced to mono 44.1 kHz, and encoded with libmp3lame.
# Usage: concat_mp3.sh <output.mp3> <chunk.mp3> [chunk2 ...]
set -euo pipefail

die() {
  local code="$1"
  shift
  echo "concat_mp3: $*" >&2
  exit "$code"
}

if [[ $# -lt 2 ]]; then
  die 2 "usage: concat_mp3.sh <output.mp3> <chunk> [chunk2 ...]"
fi

command -v ffmpeg >/dev/null 2>&1 || die 3 "ffmpeg is required on PATH (local requirement; Agensi does not provide it)"
command -v ffprobe >/dev/null 2>&1 || die 3 "ffprobe is required on PATH"

out="$1"
shift

case "$out" in
  *$'\n'*|*$'\r'*) die 4 "output path contains a newline" ;;
esac
[[ "$out" == *.mp3 || "$out" == *.MP3 ]] || die 4 "output must end in .mp3"
[[ -L "$out" ]] && die 4 "refusing to write through a symlink: $out"

out_dir="$(dirname -- "$out")"
[[ -d "$out_dir" && ! -L "$out_dir" ]] || die 4 "output directory does not exist: $out_dir"
out_dir_real="$(realpath -- "$out_dir")"
out_base="$(basename -- "$out")"
case "$out_base" in
  ""|"."|".."|*"/"*|*"\\"*) die 4 "output file name is not allowed" ;;
esac
out_real="${out_dir_real}/${out_base}"
[[ -e "$out_real" ]] && die 4 "output already exists, refusing to overwrite: $out_real"

if [[ $# -gt 100 ]]; then
  die 4 "too many inputs (maximum 100)"
fi

inputs=()
for f in "$@"; do
  case "$f" in
    *$'\n'*|*$'\r'*) die 4 "input path contains a newline" ;;
  esac
  [[ -f "$f" ]] || die 4 "not a regular file: $f"
  [[ -s "$f" ]] || die 4 "empty input: $f"
  resolved="$(realpath -- "$f")"
  [[ "$resolved" == "$out_real" ]] && die 4 "output would overwrite an input"
  codec="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "$resolved" 2>/dev/null || true)"
  [[ "$codec" == "audio" ]] || die 4 "no audio stream: $f"
  inputs+=("$resolved")
done

n="${#inputs[@]}"
filter=""
labels=""
i=0
while [[ "$i" -lt "$n" ]]; do
  filter+="[${i}:a]aformat=sample_fmts=fltp:channel_layouts=mono,aresample=44100[p${i}];"
  labels+="[p${i}]"
  i=$((i + 1))
done
filter+="${labels}concat=n=${n}:v=0:a=1[a]"

tmp_out="$(mktemp "${out_dir_real}/.docu-voice-XXXXXX.mp3")"
log="$(mktemp "${out_dir_real}/.docu-voice-XXXXXX.log")"
cleanup() {
  rm -f -- "$tmp_out" "$log"
}
trap cleanup EXIT

args=(-hide_banner -loglevel error -y)
for f in "${inputs[@]}"; do
  args+=(-i "$f")
done

if ! ffmpeg "${args[@]}" -filter_complex "$filter" -map "[a]" -c:a libmp3lame -q:a 4 "$tmp_out" >"$log" 2>&1; then
  cat "$log" >&2 || true
  die 5 "ffmpeg failed to assemble the MP3"
fi

format="$(ffprobe -v error -show_entries format=format_name -of csv=p=0 "$tmp_out" 2>/dev/null || true)"
duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmp_out" 2>/dev/null || true)"
case "$format" in
  *mp3*) ;;
  *) die 6 "assembled file is not an MP3" ;;
esac
awk -v d="$duration" 'BEGIN { if ((d + 0) <= 0) exit 1 }' || die 6 "assembled MP3 has no duration"

trap - EXIT
mv -f -- "$tmp_out" "$out_real"
rm -f -- "$log"
echo "$out_real"

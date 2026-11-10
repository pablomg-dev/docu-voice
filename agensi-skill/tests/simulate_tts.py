#!/usr/bin/env python3
"""SIMULATED speech. Not Agensi and not ElevenLabs.

Maintainers use this to test file handoff and FFmpeg. A buyer run must use
Agensi voice tools. The script refuses to start unless DOCUVOICE_SIMULATED_TTS=1.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import wave
from pathlib import Path


def refuse_unless_marked() -> None:
    import os

    if os.environ.get("DOCUVOICE_SIMULATED_TTS") != "1":
        print(
            "Refusing to run. This simulator is not Agensi TTS. "
            "Set DOCUVOICE_SIMULATED_TTS=1 only for maintainer tests.",
            file=sys.stderr,
        )
        raise SystemExit(2)


def tone_wav(path: Path, seconds: float) -> None:
    framed = max(1, int(44100 * seconds))
    with wave.open(str(path), "w") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(44100)
        # Quiet 440 Hz-ish square burst so the file is audible and valid.
        frame = b"\x00\x10" * 50 + b"\x00\xf0" * 50
        payload = (frame * ((framed // 100) + 1))[: framed * 2]
        handle.writeframes(payload)


def to_mp3(wav_path: Path, mp3_path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(wav_path),
            "-c:a",
            "libmp3lame",
            "-q:a",
            "6",
            str(mp3_path),
        ],
        check=True,
    )


def synthesize(text: str, mp3_path: Path, work: Path) -> str:
    wav_path = work / (mp3_path.stem + ".wav")
    espeak = shutil.which("espeak-ng")
    if espeak:
        source = work / (mp3_path.stem + ".txt")
        source.write_text(text, encoding="utf-8")
        subprocess.run(
            [espeak, "-s", "150", "-v", "en", "-f", str(source), "-w", str(wav_path)],
            check=True,
        )
        engine = "espeak-ng"
    else:
        tone_wav(wav_path, min(8.0, max(0.4, len(text) / 40)))
        engine = "ffmpeg-tone"
    to_mp3(wav_path, mp3_path)
    wav_path.unlink(missing_ok=True)
    return engine


def main(argv: list[str] | None = None) -> int:
    refuse_unless_marked()
    parser = argparse.ArgumentParser(description="Simulate TTS into MP3 chunks. Not Agensi.")
    parser.add_argument("--script", required=True)
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args(argv)
    payload = json.loads(Path(args.script).read_text(encoding="utf-8"))
    sections = payload["sections"]
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    files = []
    engine = "ffmpeg-tone"
    for section in sections:
        name = f"chunk-{int(section['index']):02d}.mp3"
        target = out_dir / name
        engine = synthesize(str(section["text"]), target, out_dir)
        files.append({"index": section["index"], "file": str(target), "chars": section["chars"]})
    manifest = {
        "provider": "simulated",
        "agensi": False,
        "elevenlabs": False,
        "engine": engine,
        "files": files,
    }
    manifest_path = out_dir / "simulated-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    json.dump(manifest, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

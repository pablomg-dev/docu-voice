"""FFmpeg assembly and work-directory cleanup. Audio here is a generated tone, not Agensi."""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONCAT = ROOT / "scripts" / "concat_mp3.sh"


def load_script(name: str):
    path = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.replace(".py", ""), path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


cleanup = load_script("cleanup_work_dir.py")


def make_tone(path: Path, seconds: float, frequency: int) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency={frequency}:duration={seconds}",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "9",
            str(path),
        ],
        check=True,
    )


def duration_of(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


class ConcatTests(unittest.TestCase):
    def test_joins_two_tones_into_a_valid_mp3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            first = work / "a.mp3"
            second = work / "it's b.mp3"
            output = work / "out.mp3"
            make_tone(first, 0.4, 440)
            make_tone(second, 0.4, 660)
            result = subprocess.run(
                ["bash", str(CONCAT), str(output), str(first), str(second)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(output.is_file())
            self.assertGreaterEqual(duration_of(output), 0.7)
            self.assertIn("mp3", subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=format_name", "-of", "csv=p=0", str(output)],
                check=True,
                capture_output=True,
                text=True,
            ).stdout)

    def test_rejects_missing_text_and_existing_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            tone = work / "a.mp3"
            make_tone(tone, 0.3, 440)
            missing = subprocess.run(
                ["bash", str(CONCAT), str(work / "out.mp3"), str(work / "nope.mp3")],
                capture_output=True,
                text=True,
            )
            self.assertEqual(missing.returncode, 4)
            text_file = work / "notes.mp3"
            text_file.write_text("not audio", encoding="utf-8")
            invalid = subprocess.run(
                ["bash", str(CONCAT), str(work / "out.mp3"), str(text_file)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(invalid.returncode, 4)
            output = work / "out.mp3"
            once = subprocess.run(
                ["bash", str(CONCAT), str(output), str(tone)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(once.returncode, 0, once.stderr)
            again = subprocess.run(
                ["bash", str(CONCAT), str(output), str(tone)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(again.returncode, 4)
            usage = subprocess.run(["bash", str(CONCAT)], capture_output=True, text=True)
            self.assertEqual(usage.returncode, 2)

    def test_missing_ffmpeg_exits_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            bindir = work / "bin"
            bindir.mkdir()
            for name in ("ffprobe", "realpath", "mktemp", "awk", "rm", "mv", "cat", "dirname", "basename"):
                source = shutil.which(name)
                self.assertIsNotNone(source)
                os.symlink(source, bindir / name)
            env = os.environ.copy()
            env["PATH"] = str(bindir)
            tone = work / "a.mp3"
            make_tone(tone, 0.2, 440)
            result = subprocess.run(
                ["/usr/bin/bash", str(CONCAT), str(work / "out.mp3"), str(tone)],
                capture_output=True,
                text=True,
                env=env,
            )
            self.assertEqual(result.returncode, 3, result.stderr)


class CleanupTests(unittest.TestCase):
    def test_removes_named_temp_dir_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / "docu-voice-test"
            work.mkdir()
            (work / "chunk.mp3").write_bytes(b"ID3")
            payload = cleanup.cleanup(str(work))
            self.assertTrue(payload["ok"])
            self.assertFalse(work.exists())
        with self.assertRaises(cleanup.SkillError):
            cleanup.cleanup("/tmp")
        with self.assertRaises(cleanup.SkillError):
            cleanup.cleanup(str(ROOT))


if __name__ == "__main__":
    unittest.main()

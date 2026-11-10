"""End-to-end local pipeline with simulated speech.

REAL steps: build the script from a fixture and assemble a valid MP3 with FFmpeg.
SIMULATED step: espeak-ng or a tone stands in for Agensi. Agensi is not called.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str):
    path = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.replace(".py", ""), path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


build = load_script("build_script.py")


class SimulatedPipelineTests(unittest.TestCase):
    def test_simulator_refuses_without_marker(self) -> None:
        env = os.environ.copy()
        env.pop("DOCUVOICE_SIMULATED_TTS", None)
        result = subprocess.run(
            ["python3", str(ROOT / "tests" / "simulate_tts.py"), "--script", "x", "--out-dir", "y"],
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("not Agensi", result.stderr)

    def test_fixture_becomes_one_mp3(self) -> None:
        markdown = (ROOT / "tests" / "fixtures" / "sample-readme.md").read_text(encoding="utf-8")
        script = build.build_script(markdown, source_url="https://github.com/example/sample")
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            script_path = work / "script.json"
            script_path.write_text(json.dumps(script), encoding="utf-8")
            env = os.environ.copy()
            env["DOCUVOICE_SIMULATED_TTS"] = "1"
            simulated = subprocess.run(
                [
                    "python3",
                    str(ROOT / "tests" / "simulate_tts.py"),
                    "--script",
                    str(script_path),
                    "--out-dir",
                    str(work / "chunks"),
                ],
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )
            self.assertEqual(simulated.returncode, 0, simulated.stderr)
            manifest = json.loads(simulated.stdout)
            self.assertEqual(manifest["provider"], "simulated")
            self.assertFalse(manifest["agensi"])
            self.assertFalse(manifest["elevenlabs"])
            chunks = [str(work / "chunks" / f"chunk-{index:02d}.mp3") for index in range(1, script["section_count"] + 1)]
            output = work / "docu-voice.mp3"
            assembled = subprocess.run(
                ["bash", str(ROOT / "scripts" / "concat_mp3.sh"), str(output), *chunks],
                capture_output=True,
                text=True,
            )
            self.assertEqual(assembled.returncode, 0, assembled.stderr)
            probe = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=format_name,duration",
                    "-of",
                    "csv=p=0",
                    str(output),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertIn("mp3", probe.stdout)
            self.assertGreater(float(probe.stdout.strip().split(",")[-1]), 0.5)


if __name__ == "__main__":
    unittest.main()

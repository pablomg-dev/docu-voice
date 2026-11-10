"""Tests for README splitting and spoken-script limits. No network and no Agensi."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"


def load_script(name: str):
    path = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.replace(".py", ""), path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


build = load_script("build_script.py")


class BuildScriptTests(unittest.TestCase):
    def test_sample_sections_skip_license_and_stay_single_voice(self) -> None:
        payload = build.build_script((FIXTURES / "sample-readme.md").read_text(encoding="utf-8"))
        roles = [section["role"] for section in payload["sections"]]
        self.assertEqual(roles, ["intro", "overview", "setup", "usage", "caveats"])
        self.assertFalse(payload["multi_voice"])
        self.assertEqual(payload["voice_mode"], "single")
        blob = " ".join(section["text"] for section in payload["sections"])
        self.assertNotIn("MIT", blob)
        self.assertLessEqual(payload["spoken_chars"], build.MAX_TOTAL_CHARS)
        self.assertLessEqual(payload["section_count"], build.MAX_SECTIONS)

    def test_code_and_secrets_are_not_spoken(self) -> None:
        payload = build.build_script((FIXTURES / "code-readme.md").read_text(encoding="utf-8"))
        blob = " ".join(section["text"] for section in payload["sections"])
        self.assertNotIn("secret-token-do-not-speak", blob)
        self.assertIn("Code samples are left out", blob)

    def test_blockquote_lists_and_emoji_are_spoken_cleanly(self) -> None:
        markdown = (
            "# DocuVoice 🎙️\n\n"
            "> Turn any documentation into a podcast.\n\n"
            "Built with care.\n\n"
            "## Stack\n\n"
            "- Next.js\n"
            "- ffmpeg\n\n"
            "This extra sentence exists so the spoken script clears the length floor.\n"
        )
        payload = build.build_script(markdown)
        blob = " ".join(section["text"] for section in payload["sections"])
        self.assertNotIn(">", blob)
        self.assertNotIn("🎙", blob)
        self.assertIn("Next.js.", blob)
        self.assertIn("ffmpeg.", blob)

    def test_short_readme_is_rejected(self) -> None:
        with self.assertRaises(build.SkillError) as caught:
            build.build_script((FIXTURES / "short.md").read_text(encoding="utf-8"))
        self.assertEqual(caught.exception.code, "too_short")

    def test_long_section_is_capped(self) -> None:
        paragraph = "This sentence explains the project in plain words. " * 80
        markdown = "# Big\n\n" + paragraph + "\n\n## Usage\n\nRun the tool once a day.\n"
        payload = build.build_script(markdown)
        for section in payload["sections"]:
            self.assertLessEqual(section["chars"], build.MAX_SECTION_CHARS)
        self.assertLessEqual(payload["spoken_chars"], build.MAX_TOTAL_CHARS)

    def test_cli_refuses_repo_output(self) -> None:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            code = build.main(
                [
                    "--input",
                    str(FIXTURES / "sample-readme.md"),
                    "--out",
                    str(ROOT / "tests" / "fixtures" / "nope.json"),
                ]
            )
        self.assertEqual(code, 2)
        self.assertFalse((ROOT / "tests" / "fixtures" / "nope.json").exists())

    def test_cli_writes_temp_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = str(Path(tmp) / "script.json")
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                code = build.main(
                    [
                        "--input",
                        str(FIXTURES / "sample-readme.md"),
                        "--out",
                        dest,
                        "--source-url",
                        "https://github.com/example/sample",
                    ]
                )
            self.assertEqual(code, 0)
            text = Path(dest).read_text(encoding="utf-8")
            self.assertIn("example/sample", text)
            self.assertIn('"voice_mode": "single"', text)


if __name__ == "__main__":
    unittest.main()

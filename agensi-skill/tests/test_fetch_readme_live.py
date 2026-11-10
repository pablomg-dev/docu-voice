"""Live GitHub fetch. This contacts the public network. It does not call Agensi."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str):
    path = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location("fetch_readme_live", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


fetch = load_script("fetch_readme.py")


class LiveFetchTests(unittest.TestCase):
    def test_public_github_readme(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = str(Path(tmp) / "readme.md")
            payload = fetch.fetch_readme(
                "https://github.com/octocat/Hello-World",
                dest,
                timeout=20,
            )
            text = Path(payload["out"]).read_text(encoding="utf-8")
            self.assertTrue(payload["ok"])
            self.assertGreater(payload["bytes"], 10)
            self.assertNotIn("<html", text.lower())
            resolved = str(payload["resolved_url"])
            self.assertTrue(
                "raw.githubusercontent.com" in resolved or "github.com" in resolved,
                resolved,
            )


if __name__ == "__main__":
    unittest.main()

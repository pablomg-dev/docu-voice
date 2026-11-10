"""Hermetic tests for README URL checks and fetch error handling.

No test in this file contacts GitHub or Agensi. The live fetch is
tests/test_fetch_readme_live.py.
"""

from __future__ import annotations

import importlib.util
import json
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


fetch = load_script("fetch_readme.py")


class PlanTests(unittest.TestCase):
    def test_rejects_non_https_userinfo_and_other_hosts(self) -> None:
        for url in (
            "http://github.com/octocat/Hello-World",
            "https://user:token@github.com/octocat/Hello-World",
            "https://example.com/octocat/Hello-World",
            "file:///etc/passwd",
            "https://github.com/not a repo",
            "",
        ):
            with self.assertRaises(fetch.SkillError) as caught:
                fetch.plan_from_url(url)
            self.assertIn(caught.exception.code, {"invalid_url"})

    def test_bare_repo_and_query_string(self) -> None:
        plan = fetch.plan_from_url("https://github.com/octocat/Hello-World?tab=readme-ov-file")
        self.assertEqual(plan.owner, "octocat")
        self.assertEqual(plan.repo, "Hello-World")
        self.assertEqual(plan.ref, "HEAD")
        self.assertEqual(plan.path, "README.md")
        self.assertEqual(plan.kind, "repo")

    def test_blob_readme_and_rejects_other_files(self) -> None:
        plan = fetch.plan_from_url("https://github.com/octocat/Hello-World/blob/main/README.md")
        self.assertEqual((plan.ref, plan.path, plan.kind), ("main", "README.md", "file"))
        with self.assertRaises(fetch.SkillError) as caught:
            fetch.plan_from_url("https://github.com/octocat/Hello-World/blob/main/LICENSE")
        self.assertEqual(caught.exception.code, "not_readme")

    def test_raw_readme(self) -> None:
        plan = fetch.plan_from_url(
            "https://raw.githubusercontent.com/octocat/Hello-World/main/README.md"
        )
        self.assertEqual(plan.path, "README.md")
        self.assertEqual(plan.kind, "file")


class FetchTests(unittest.TestCase):
    def test_writes_readme_and_falls_back_after_404(self) -> None:
        calls: list[str] = []

        def transport(url: str, headers: dict[str, str]) -> fetch.HttpBody:
            calls.append(url)
            if "raw.githubusercontent.com" in url:
                return fetch.HttpBody(404, b"not found", url)
            self.assertIn("application/vnd.github.raw", headers["Accept"])
            return fetch.HttpBody(200, b"# Hello\n\nA public readme.\n", url)

        with tempfile.TemporaryDirectory() as tmp:
            dest = str(Path(tmp) / "readme.md")
            payload = fetch.fetch_readme(
                "https://github.com/octocat/Hello-World",
                dest,
                transport=transport,
            )
            self.assertTrue(payload["ok"])
            self.assertEqual(Path(payload["out"]).read_text(encoding="utf-8").splitlines()[0], "# Hello")
            self.assertEqual(len(calls), 2)

    def test_http_html_empty_and_oversize(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = str(Path(tmp) / "readme.md")
            with self.assertRaises(fetch.SkillError) as caught:
                fetch.fetch_readme(
                    "https://github.com/octocat/Hello-World",
                    dest,
                    transport=lambda url, headers: fetch.HttpBody(503, b"nope", url),
                )
            self.assertEqual(caught.exception.code, "http_error")
            self.assertEqual(caught.exception.status, 503)

            with self.assertRaises(fetch.SkillError) as caught:
                fetch.fetch_readme(
                    "https://github.com/octocat/Hello-World/blob/main/README.md",
                    dest,
                    transport=lambda url, headers: fetch.HttpBody(200, b"<!DOCTYPE html><html></html>", url),
                )
            self.assertEqual(caught.exception.code, "invalid_response")

            with self.assertRaises(fetch.SkillError) as caught:
                fetch.fetch_readme(
                    "https://github.com/octocat/Hello-World/blob/main/README.md",
                    dest,
                    transport=lambda url, headers: fetch.HttpBody(200, b"   \n", url),
                )
            self.assertEqual(caught.exception.code, "empty")

            with self.assertRaises(fetch.SkillError) as caught:
                fetch.fetch_readme(
                    "https://github.com/octocat/Hello-World/blob/main/README.md",
                    dest,
                    transport=lambda url, headers: fetch.HttpBody(200, b"x" * (fetch.MAX_BYTES + 1), url),
                )
            self.assertEqual(caught.exception.code, "too_large")

    def test_refuses_output_outside_temp(self) -> None:
        outside = ROOT / "tests" / "fixtures" / "should-not-write.md"
        with self.assertRaises(fetch.SkillError) as caught:
            fetch.fetch_readme(
                "https://github.com/octocat/Hello-World/blob/main/README.md",
                str(outside),
                transport=lambda url, headers: fetch.HttpBody(200, b"# Hello\n\nEnough text.\n", url),
            )
        self.assertEqual(caught.exception.code, "unsafe_path")
        self.assertFalse(outside.exists())

    def test_cli_error_json(self) -> None:
        import contextlib
        import io

        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            code = fetch.main(["--url", "ftp://github.com/a/b", "--out", "/tmp/readme.md"])
        self.assertEqual(code, 2)


class RedirectGuardTests(unittest.TestCase):
    def test_redirect_host_must_stay_on_github(self) -> None:
        with self.assertRaises(fetch.SkillError):
            fetch.assert_github_url("https://evil.example/readme.md")


class CliRoundTripTests(unittest.TestCase):
    def test_cli_prints_json(self) -> None:
        original = fetch.urllib_transport

        def fake(url: str, headers: dict[str, str], timeout: float) -> fetch.HttpBody:
            return fetch.HttpBody(200, b"# Title\n\nBody text for the readme.\n", url)

        fetch.urllib_transport = fake
        try:
            with tempfile.TemporaryDirectory() as tmp:
                dest = str(Path(tmp) / "readme.md")
                from io import StringIO
                import contextlib

                stdout = StringIO()
                with contextlib.redirect_stdout(stdout):
                    code = fetch.main(
                        ["--url", "https://github.com/octocat/Hello-World", "--out", dest]
                    )
                self.assertEqual(code, 0)
                payload = json.loads(stdout.getvalue())
                self.assertTrue(payload["ok"])
                self.assertTrue(Path(payload["out"]).is_file())
        finally:
            fetch.urllib_transport = original


if __name__ == "__main__":
    unittest.main()

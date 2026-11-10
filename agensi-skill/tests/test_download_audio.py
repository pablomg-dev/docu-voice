"""Simulated audio download tests. They do not contact Agensi or the network."""

from __future__ import annotations

import importlib.util
import os
import tempfile
import unittest
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str):
    path = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.replace(".py", ""), path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


download = load_script("download_audio.py")


def public_resolver(host, port, *args, **kwargs):
    return [(None, None, None, None, ("1.1.1.1", 443))]


def private_resolver(host, port, *args, **kwargs):
    return [(None, None, None, None, ("127.0.0.1", 443))]


def wav_bytes() -> bytes:
    fd, name = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    path = Path(name)
    try:
        with wave.open(str(path), "w") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(8000)
            handle.writeframes(b"\x00\x00" * 800)
        return path.read_bytes()
    finally:
        path.unlink(missing_ok=True)


class UrlGuardTests(unittest.TestCase):
    def test_rejects_private_and_insecure_urls(self) -> None:
        blocked = (
            "http://example.com/a.mp3",
            "https://user:pw@example.com/a.mp3",
            "https://127.0.0.1/a.mp3",
            "https://10.1.1.5/a.mp3",
            "https://localhost/a.mp3",
            "https://169.254.169.254/latest/meta-data",
            "file:///tmp/a.mp3",
        )
        for url in blocked:
            with self.assertRaises(download.SkillError):
                download.assert_public_https(url, public_resolver)

    def test_rejects_public_name_that_resolves_privately(self) -> None:
        with self.assertRaises(download.SkillError) as caught:
            download.assert_public_https("https://cdn.example/a.mp3", private_resolver)
        self.assertEqual(caught.exception.code, "invalid_url")


class DownloadTests(unittest.TestCase):
    def test_saves_audio_bytes_under_temp(self) -> None:
        body = wav_bytes()

        def transport(url: str) -> download.HttpBody:
            return download.HttpBody(200, body, url)

        with tempfile.TemporaryDirectory() as tmp:
            dest = str(Path(tmp) / "chunk-01.wav")
            payload = download.download_audio(
                "https://cdn.example/chunk.wav",
                dest,
                transport=transport,
                resolver=public_resolver,
            )
            self.assertTrue(payload["ok"])
            self.assertEqual(Path(payload["out"]).read_bytes()[:4], b"RIFF")

    def test_rejects_html_and_oversize_and_http_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = str(Path(tmp) / "chunk.mp3")
            with self.assertRaises(download.SkillError) as caught:
                download.download_audio(
                    "https://cdn.example/chunk.mp3",
                    dest,
                    transport=lambda url: download.HttpBody(200, b"<html>login</html>", url),
                    resolver=public_resolver,
                )
            self.assertEqual(caught.exception.code, "invalid_audio")
            with self.assertRaises(download.SkillError) as caught:
                download.download_audio(
                    "https://cdn.example/chunk.mp3",
                    dest,
                    transport=lambda url: download.HttpBody(200, b"ID3" + b"x" * 50, url),
                    resolver=public_resolver,
                    max_bytes=10,
                )
            self.assertEqual(caught.exception.code, "too_large")
            with self.assertRaises(download.SkillError) as caught:
                download.download_audio(
                    "https://cdn.example/chunk.mp3",
                    dest,
                    transport=lambda url: download.HttpBody(404, b"", url),
                    resolver=public_resolver,
                )
            self.assertEqual(caught.exception.code, "http_error")

    def test_refuses_final_url_on_a_private_host(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(download.SkillError):
                download.download_audio(
                    "https://cdn.example/chunk.wav",
                    str(Path(tmp) / "chunk.wav"),
                    transport=lambda url: download.HttpBody(200, wav_bytes(), "https://127.0.0.1/secret.wav"),
                    resolver=public_resolver,
                )


if __name__ == "__main__":
    unittest.main()

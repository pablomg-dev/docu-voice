#!/usr/bin/env python3
"""Download one HTTPS audio file into the system temp directory.

Agensi documents tool output as a link (7 days) that also appears in
Dashboard, Balance (30 days). A local path is not documented. This script is
the local handoff for that link. It does not call Agensi and does not read
other files from this skill package.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import socket
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable

MAX_BYTES = 20 * 1024 * 1024
USER_AGENT = "docu-voice-agensi-poc"
BLOCKED_HOSTS = {"localhost", "localhost.localdomain", "metadata.google.internal"}


class SkillError(Exception):
    def __init__(self, code: str, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


class HttpBody:
    def __init__(self, status: int, body: bytes, final_url: str) -> None:
        self.status = status
        self.body = body
        self.final_url = final_url


Resolver = Callable[..., list]
Transport = Callable[[str], HttpBody]


def temp_roots() -> set[Path]:
    roots = {Path(tempfile.gettempdir()).resolve(), Path("/tmp").resolve()}
    var_tmp = Path("/var/tmp")
    if var_tmp.exists():
        roots.add(var_tmp.resolve())
    return roots


def under_temp(path: Path) -> bool:
    resolved = path.resolve()
    return any(resolved == root or root in resolved.parents for root in temp_roots())


def resolve_temp_destination(dest: str) -> Path:
    raw = Path(dest)
    if not raw.is_absolute():
        raise SkillError("unsafe_path", "Output path must be absolute")
    if raw.is_symlink() or not raw.parent.is_dir() or not under_temp(raw.parent):
        raise SkillError("unsafe_path", "Output must be a new file under the system temp directory")
    target = raw.parent.resolve() / raw.name
    if target.is_symlink() or raw.name in {"", ".", ".."}:
        raise SkillError("unsafe_path", "Output file name is not allowed")
    return target


def _public_ip(value: str) -> None:
    try:
        address = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError as exc:
        raise SkillError("invalid_url", "Resolved address is not usable") from exc
    if not address.is_global:
        raise SkillError("invalid_url", "Host is not a public address")


def assert_public_https(url: str, resolver: Resolver = socket.getaddrinfo) -> None:
    if not isinstance(url, str) or not url.strip() or any(char in url for char in ("\n", "\r", "\t", " ")):
        raise SkillError("invalid_url", "Audio URL is empty or contains whitespace")
    parsed = urllib.parse.urlparse(url.strip())
    if parsed.scheme != "https":
        raise SkillError("invalid_url", "Only https audio URLs are accepted")
    if parsed.username or parsed.password:
        raise SkillError("invalid_url", "URLs with credentials are rejected")
    if parsed.port not in (None, 443):
        raise SkillError("invalid_url", "Only port 443 is accepted")
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host or host in BLOCKED_HOSTS or host.endswith(".local") or host.endswith(".localhost"):
        raise SkillError("invalid_url", "Host is not allowed")
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        if not literal.is_global:
            raise SkillError("invalid_url", "IP address is not public")
        return
    try:
        infos = resolver(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise SkillError("network", f"Could not resolve {host}") from exc
    if not infos:
        raise SkillError("network", f"Could not resolve {host}")
    for info in infos:
        _public_ip(str(info[4][0]))


def looks_like_audio(body: bytes) -> bool:
    if len(body) < 4:
        return False
    if body.startswith(b"ID3") or body.startswith(b"OggS") or body.startswith(b"fLaC") or body.startswith(b"RIFF"):
        return True
    return body[0] == 0xFF and (body[1] & 0xE0) == 0xE0


def read_capped(response: object, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        block = response.read(65536)  # type: ignore[attr-defined]
        if not block:
            break
        total += len(block)
        if total > limit:
            raise SkillError("too_large", f"Audio is larger than {limit} bytes")
        chunks.append(block)
    return b"".join(chunks)


def urllib_transport(url: str, timeout: float, max_bytes: int, resolver: Resolver) -> HttpBody:
    assert_public_https(url, resolver)

    class Guard(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, hdrs, newurl):  # type: ignore[no-untyped-def]
            assert_public_https(newurl, resolver)
            return super().redirect_request(req, fp, code, msg, hdrs, newurl)

    opener = urllib.request.build_opener(Guard)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "audio/*,*/*;q=0.1"})
    try:
        with opener.open(request, timeout=timeout) as response:
            length = response.headers.get("Content-Length")
            if length and length.isdigit() and int(length) > max_bytes:
                raise SkillError("too_large", f"Audio is larger than {max_bytes} bytes")
            body = read_capped(response, max_bytes)
            return HttpBody(getattr(response, "status", 200), body, response.geturl())
    except SkillError:
        raise
    except urllib.error.HTTPError as exc:
        raise SkillError("http_error", f"HTTP {exc.code} downloading audio", status=exc.code) from exc
    except (TimeoutError, socket.timeout) as exc:
        raise SkillError("timeout", "Audio download timed out") from exc
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, socket.timeout):
            raise SkillError("timeout", "Audio download timed out") from exc
        raise SkillError("network", "Network error while downloading audio") from exc


def download_audio(
    url: str,
    dest: str,
    *,
    transport: Transport | None = None,
    resolver: Resolver = socket.getaddrinfo,
    max_bytes: int = MAX_BYTES,
    timeout: float = 30.0,
) -> dict[str, object]:
    assert_public_https(url, resolver)
    if transport is None:
        result = urllib_transport(url, timeout, max_bytes, resolver)
    else:
        result = transport(url)
        if result.final_url:
            assert_public_https(result.final_url, resolver)
    if result.status != 200:
        raise SkillError("http_error", f"HTTP {result.status} downloading audio", status=result.status)
    if len(result.body) > max_bytes:
        raise SkillError("too_large", f"Audio is larger than {max_bytes} bytes")
    if not looks_like_audio(result.body):
        raise SkillError(
            "invalid_audio",
            "Download was not a recognized audio file. Save the file from the Agensi link "
            "or Dashboard, Balance, into the work directory and retry assembly.",
        )
    target = resolve_temp_destination(dest)
    partial = target.parent / f".{target.name}.partial"
    partial.write_bytes(result.body)
    os.replace(partial, target)
    return {"ok": True, "out": str(target), "bytes": target.stat().st_size, "source_url": url.strip()}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download one public HTTPS audio file into temp.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--timeout", type=float, default=30.0)
    args = parser.parse_args(argv)
    try:
        payload = download_audio(args.url, args.out, timeout=args.timeout)
    except SkillError as exc:
        payload = {"ok": False, "error": exc.code, "message": str(exc)}
        if exc.status is not None:
            payload["status"] = exc.status
        json.dump(payload, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        print(str(exc), file=sys.stderr)
        return 2
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

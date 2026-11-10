#!/usr/bin/env python3
"""Fetch a public GitHub README into a file under the system temp directory.

Self-contained. Uses the Python standard library only. Does not read other
files from this skill package.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import socket
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable, NamedTuple

MAX_BYTES = 512 * 1024
MAX_URL_LENGTH = 2000
USER_AGENT = "docu-voice-agensi-poc"
README_FILENAMES = {"readme", "readme.md", "readme.markdown", "readme.txt"}
GITHUB_HOSTS = {
    "github.com",
    "www.github.com",
    "raw.githubusercontent.com",
    "api.github.com",
    "objects.githubusercontent.com",
}
_OWNER = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")
_REPO = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
_REF = re.compile(r"^[A-Za-z0-9._-]{1,255}$")


class SkillError(Exception):
    def __init__(self, code: str, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


class Plan(NamedTuple):
    owner: str
    repo: str
    ref: str
    path: str
    kind: str


class HttpBody(NamedTuple):
    status: int
    body: bytes
    final_url: str


Transport = Callable[[str, dict[str, str]], HttpBody]


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
    if raw.is_symlink():
        raise SkillError("unsafe_path", "Refusing to write through a symlink")
    parent = raw.parent
    if not parent.is_dir():
        raise SkillError("unsafe_path", "Output directory does not exist")
    real_parent = parent.resolve()
    if not under_temp(real_parent):
        raise SkillError("unsafe_path", "Output must stay under the system temp directory")
    target = real_parent / raw.name
    if target.is_symlink():
        raise SkillError("unsafe_path", "Refusing to write through a symlink")
    if not raw.name or raw.name in {".", ".."} or "/" in raw.name or "\\" in raw.name:
        raise SkillError("unsafe_path", "Output file name is not allowed")
    return target


def assert_github_url(url: str) -> urllib.parse.ParseResult:
    if not isinstance(url, str):
        raise SkillError("invalid_url", "URL must be a string")
    candidate = url.strip()
    if not candidate or len(candidate) > MAX_URL_LENGTH:
        raise SkillError("invalid_url", "URL is empty or too long")
    if any(char in candidate for char in ("\n", "\r", "\t", " ")):
        raise SkillError("invalid_url", "URL contains whitespace")
    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme != "https":
        raise SkillError("invalid_url", "Only https GitHub URLs are accepted")
    if parsed.username or parsed.password:
        raise SkillError("invalid_url", "URLs with credentials are rejected")
    if parsed.port not in (None, 443):
        raise SkillError("invalid_url", "Only the default HTTPS port is accepted")
    host = (parsed.hostname or "").lower().rstrip(".")
    if host not in GITHUB_HOSTS:
        raise SkillError("invalid_url", "Host is not a public GitHub host")
    return parsed


def _owner_repo(owner: str, repo: str) -> tuple[str, str]:
    if repo.endswith(".git"):
        repo = repo[: -len(".git")]
    if not _OWNER.match(owner) or not _REPO.match(repo) or repo in {".", ".."}:
        raise SkillError("invalid_url", "Owner or repository name is invalid")
    return owner, repo


def _is_readme_path(path: str) -> bool:
    name = path.rsplit("/", 1)[-1].lower()
    return name in README_FILENAMES


def _safe_rel_path(path: str) -> str:
    parts = [part for part in path.split("/") if part]
    if not parts or any(part in {".", ".."} or "\\" in part for part in parts):
        raise SkillError("invalid_url", "README path is not allowed")
    if not _is_readme_path("/".join(parts)):
        raise SkillError("not_readme", "URL does not point at a README file")
    return "/".join(parts)


def plan_from_url(url: str) -> Plan:
    parsed = assert_github_url(url)
    host = (parsed.hostname or "").lower()
    parts = [urllib.parse.unquote(part) for part in parsed.path.split("/") if part]
    if host in {"github.com", "www.github.com"}:
        if len(parts) < 2:
            raise SkillError("invalid_url", "Expected https://github.com/owner/repo")
        owner, repo = _owner_repo(parts[0], parts[1])
        rest = parts[2:]
        if not rest:
            return Plan(owner, repo, "HEAD", "README.md", "repo")
        mode = rest[0].lower()
        if mode in {"blob", "raw"}:
            if len(rest) < 3:
                raise SkillError("invalid_url", "File URL is missing a ref or a path")
            ref = rest[1]
            if not _REF.match(ref):
                raise SkillError(
                    "invalid_url",
                    "Ref must be a single segment without slashes. Paste the raw README URL if the ref contains a slash.",
                )
            path = _safe_rel_path("/".join(rest[2:]))
            return Plan(owner, repo, ref, path, "file")
        if mode == "tree":
            if len(rest) != 2 or not _REF.match(rest[1]):
                raise SkillError("invalid_url", "Only a repository root tree URL is accepted")
            return Plan(owner, repo, rest[1], "README.md", "repo")
        raise SkillError("invalid_url", "Use a repository URL or a URL that points at a README file")
    if host == "raw.githubusercontent.com":
        if len(parts) < 4:
            raise SkillError("invalid_url", "Raw URL is missing owner, repo, ref, or file")
        owner, repo = _owner_repo(parts[0], parts[1])
        ref = parts[2]
        if not _REF.match(ref):
            raise SkillError("invalid_url", "Raw URL ref is not allowed")
        path = _safe_rel_path("/".join(parts[3:]))
        return Plan(owner, repo, ref, path, "file")
    if host == "api.github.com":
        if len(parts) == 4 and parts[0] == "repos" and parts[3] == "readme":
            owner, repo = _owner_repo(parts[1], parts[2])
            return Plan(owner, repo, "HEAD", "README.md", "repo")
        raise SkillError("invalid_url", "Only the GitHub repository README API URL is accepted")
    raise SkillError("invalid_url", "This GitHub URL is not a README")


def raw_url(plan: Plan) -> str:
    ref = urllib.parse.quote(plan.ref, safe="")
    path = "/".join(urllib.parse.quote(part) for part in plan.path.split("/"))
    return f"https://raw.githubusercontent.com/{plan.owner}/{plan.repo}/{ref}/{path}"


def api_readme_url(plan: Plan) -> str:
    owner = urllib.parse.quote(plan.owner)
    repo = urllib.parse.quote(plan.repo)
    return f"https://api.github.com/repos/{owner}/{repo}/readme"


def read_capped(response: object, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        block = response.read(8192)  # type: ignore[attr-defined]
        if not block:
            break
        total += len(block)
        if total > limit:
            raise SkillError("too_large", f"README is larger than {limit} bytes")
        chunks.append(block)
    return b"".join(chunks)


def urllib_transport(url: str, headers: dict[str, str], timeout: float) -> HttpBody:
    assert_github_url(url)

    class Guard(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, hdrs, newurl):  # type: ignore[no-untyped-def]
            assert_github_url(newurl)
            return super().redirect_request(req, fp, code, msg, hdrs, newurl)

    opener = urllib.request.build_opener(Guard)
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with opener.open(request, timeout=timeout) as response:
            length = response.headers.get("Content-Length")
            if length and length.isdigit() and int(length) > MAX_BYTES:
                raise SkillError("too_large", f"README is larger than {MAX_BYTES} bytes")
            body = read_capped(response, MAX_BYTES)
            return HttpBody(getattr(response, "status", 200), body, response.geturl())
    except SkillError:
        raise
    except urllib.error.HTTPError as exc:
        body = exc.read(MAX_BYTES + 1) if exc.fp is not None else b""
        if len(body) > MAX_BYTES:
            raise SkillError("too_large", f"README is larger than {MAX_BYTES} bytes") from exc
        return HttpBody(exc.code, body, url)
    except (TimeoutError, socket.timeout) as exc:
        raise SkillError("timeout", "Request timed out") from exc
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, socket.timeout):
            raise SkillError("timeout", "Request timed out") from exc
        raise SkillError("network", "Network error while fetching the README") from exc


def unwrap_github_body(body: bytes) -> bytes:
    stripped = body.lstrip()
    if not stripped.startswith(b"{"):
        return body
    try:
        data = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return body
    if isinstance(data, dict) and data.get("encoding") == "base64" and isinstance(data.get("content"), str):
        try:
            return base64.b64decode(data["content"], validate=False)
        except (ValueError, TypeError) as exc:
            raise SkillError("invalid_response", "GitHub README payload could not be decoded") from exc
    if isinstance(data, dict) and isinstance(data.get("message"), str):
        raise SkillError("invalid_response", data["message"][:200])
    return body


def decode_readme(body: bytes) -> str:
    payload = unwrap_github_body(body)
    if b"\x00" in payload[:1024]:
        raise SkillError("invalid_response", "Response is not a text README")
    if len(payload) > MAX_BYTES:
        raise SkillError("too_large", f"README is larger than {MAX_BYTES} bytes")
    text = payload.decode("utf-8-sig", errors="replace").strip()
    lowered = text[:200].lower()
    if lowered.startswith("<!doctype html") or lowered.startswith("<html"):
        raise SkillError("invalid_response", "GitHub returned HTML instead of a README")
    if not text:
        raise SkillError("empty", "README is empty")
    return text


def write_text(dest: str, text: str) -> Path:
    target = resolve_temp_destination(dest)
    partial = target.parent / f".{target.name}.partial"
    partial.write_text(text, encoding="utf-8")
    os.replace(partial, target)
    return target


def fetch_readme(
    url: str,
    dest: str,
    *,
    transport: Transport | None = None,
    timeout: float = 15.0,
) -> dict[str, object]:
    plan = plan_from_url(url)
    if transport is None:
        def transport(request_url: str, headers: dict[str, str]) -> HttpBody:
            return urllib_transport(request_url, headers, timeout)

    primary = raw_url(plan)
    result = transport(primary, {"User-Agent": USER_AGENT, "Accept": "text/plain, text/markdown;q=0.9"})
    resolved = result.final_url or primary
    allow_fallback = plan.kind == "repo" and plan.ref == "HEAD" and plan.path.lower() == "readme.md"
    if result.status == 404 and allow_fallback:
        fallback = api_readme_url(plan)
        result = transport(
            fallback,
            {"User-Agent": USER_AGENT, "Accept": "application/vnd.github.raw"},
        )
        resolved = result.final_url or fallback
    if result.status != 200:
        raise SkillError("http_error", f"HTTP {result.status} fetching the README", status=result.status)
    text = decode_readme(result.body)
    target = write_text(dest, text + "\n")
    return {
        "ok": True,
        "url": url.strip(),
        "resolved_url": resolved,
        "owner": plan.owner,
        "repo": plan.repo,
        "ref": plan.ref,
        "path": plan.path,
        "bytes": target.stat().st_size,
        "out": str(target),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch a public GitHub README into a temp file.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--timeout", type=float, default=15.0)
    args = parser.parse_args(argv)
    try:
        payload = fetch_readme(args.url, args.out, timeout=args.timeout)
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

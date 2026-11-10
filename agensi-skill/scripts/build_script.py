#!/usr/bin/env python3
"""Turn a README into a short single-voice narration script.

Self-contained. Uses the Python standard library only. Writes JSON under the
system temp directory and does not read other files from this skill package.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import unicodedata
from pathlib import Path

MAX_INPUT_BYTES = 512 * 1024
MAX_SECTIONS = 5
MAX_SECTION_CHARS = 480
MAX_TOTAL_CHARS = 1800
MIN_TOTAL_CHARS = 80

SKIP_TITLES = (
    "license",
    "licence",
    "contributing",
    "changelog",
    "code of conduct",
    "authors",
    "acknowledg",
    "security policy",
)
CAVEAT_KEYS = (
    "warning",
    "caution",
    "caveat",
    "limit",
    "breaking",
    "security",
    "advertencia",
    "peligro",
    "limitacion",
    "limitación",
)
SETUP_KEYS = (
    "install",
    "setup",
    "getting started",
    "requirement",
    "prerequisite",
    "quick start",
    "quickstart",
    "instalaci",
    "requisito",
    "empezar",
)
USAGE_KEYS = ("usage", "how to", "example", "ejempl", "uso", "guía", "guia")
OVERVIEW_KEYS = (
    "overview",
    "about",
    "what is",
    "what it",
    "description",
    "resumen",
    "descripci",
)
INTRO_KEYS = ("introduction", "intro")


class SkillError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


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
    if not raw.parent.is_dir() or not under_temp(raw.parent):
        raise SkillError("unsafe_path", "Output must stay under the system temp directory")
    target = raw.parent.resolve() / raw.name
    if target.is_symlink() or raw.name in {"", ".", ".."}:
        raise SkillError("unsafe_path", "Output file name is not allowed")
    return target


def read_input(path: str) -> str:
    raw = Path(path)
    if not raw.is_file() or raw.is_symlink():
        raise SkillError("input_invalid", "Input must be a regular file")
    if raw.stat().st_size > MAX_INPUT_BYTES:
        raise SkillError("too_large", f"README is larger than {MAX_INPUT_BYTES} bytes")
    data = raw.read_bytes()
    if b"\x00" in data[:1024]:
        raise SkillError("input_invalid", "Input is not text")
    return data.decode("utf-8-sig", errors="replace")


def classify(title: str) -> str:
    folded = title.casefold()
    if any(key in folded for key in SKIP_TITLES):
        return "skip"
    if any(key in folded for key in CAVEAT_KEYS):
        return "caveats"
    if any(key in folded for key in SETUP_KEYS):
        return "setup"
    if any(key in folded for key in USAGE_KEYS):
        return "usage"
    if any(key in folded for key in OVERVIEW_KEYS):
        return "overview"
    if any(key in folded for key in INTRO_KEYS):
        return "intro"
    return "other"


def strip_symbols(text: str) -> str:
    kept: list[str] = []
    for char in text:
        if char in {"\ufe0e", "\ufe0f", "\u200d"}:
            continue
        if unicodedata.category(char) == "So":
            continue
        kept.append(char)
    return "".join(kept)


def clean_title(title: str) -> str:
    title = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", title)
    title = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", title)
    title = re.sub(r"[`*_]{1,3}", "", title)
    title = re.sub(r"<[^>]+>", "", title)
    title = strip_symbols(title)
    title = re.sub(r"\s+", " ", title).strip(" -:#")
    return title or "Section"


def to_speech(body: str) -> str:
    lines = body.splitlines()
    spoken: list[str] = []
    in_fence = False
    saw_code = False
    saw_table = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            saw_code = True
            continue
        if in_fence or not stripped or stripped.startswith("<!--"):
            continue
        if stripped.count("|") >= 2:
            saw_table = True
            continue
        if re.match(r"^[-*_]{3,}$", stripped) or stripped.startswith("!["):
            continue
        is_item = bool(re.match(r"^([-*+]|\d+[.)])\s+", stripped))
        stripped = re.sub(r"^>\s?", "", stripped)
        stripped = re.sub(r"^#{1,6}\s+", "", stripped)
        stripped = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", stripped)
        stripped = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", stripped)
        stripped = re.sub(r"https?://\S+", "", stripped)
        stripped = re.sub(r"`([^`]*)`", r"\1", stripped)
        stripped = re.sub(r"\*\*([^*]+)\*\*", r"\1", stripped)
        stripped = re.sub(r"\*([^*]+)\*", r"\1", stripped)
        stripped = re.sub(r"__([^_]+)__", r"\1", stripped)
        stripped = re.sub(r"<[^>]+>", " ", stripped)
        stripped = re.sub(r"^[-*+]\s+", "", stripped)
        stripped = re.sub(r"^\d+[.)]\s+", "", stripped)
        stripped = (
            stripped.replace("&amp;", " and ")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", '"')
            .replace("&#39;", "'")
        )
        stripped = stripped.replace(" & ", " and ")
        stripped = re.sub(r"#(\w+)", r"\1", stripped)
        stripped = strip_symbols(stripped)
        stripped = re.sub(r"\s+", " ", stripped).strip(" -")
        if is_item and stripped and stripped[-1] not in ".!?":
            stripped += "."
        if stripped:
            spoken.append(stripped)
    text = re.sub(r"\s+", " ", " ".join(spoken)).strip()
    notes: list[str] = []
    if saw_code:
        notes.append("Code samples are left out of this narration.")
    if saw_table:
        notes.append("A table is left out of this narration.")
    if notes:
        text = f"{text} {' '.join(notes)}".strip()
    return text


def split_sections(markdown: str) -> list[tuple[str, str]]:
    markdown = re.sub(r"<!--.*?-->", "", markdown, flags=re.DOTALL)
    sections: list[tuple[str, str]] = []
    title = "Introduction"
    buf: list[str] = []
    for line in markdown.splitlines():
        match = re.match(r"^(#{1,2})\s+(.+?)\s*#*\s*$", line)
        if match:
            sections.append((title, "\n".join(buf)))
            title = clean_title(match.group(2))
            buf = []
        else:
            buf.append(line)
    sections.append((title, "\n".join(buf)))
    return sections


def cap_text(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rstrip()
    for mark in (". ", "? ", "! "):
        index = cut.rfind(mark)
        if index >= int(limit * 0.6):
            return cut[: index + 1].strip()
    space = cut.rfind(" ")
    if space > 0:
        cut = cut[:space]
    return cut.rstrip(".,;: ") + "."


def compose(title: str, body: str) -> str:
    body = body.strip()
    if not body:
        return title.strip()
    if body.casefold().startswith(title.casefold()):
        return body
    return f"{title.strip()}. {body}"


def build_script(markdown: str, source_url: str | None = None) -> dict[str, object]:
    if len(markdown.encode("utf-8")) > MAX_INPUT_BYTES:
        raise SkillError("too_large", f"README is larger than {MAX_INPUT_BYTES} bytes")
    prepared: list[dict[str, str]] = []
    for title, body in split_sections(markdown):
        speech = to_speech(body)
        role = classify(title)
        if role == "skip" or not speech:
            continue
        prepared.append({"title": title, "role": role, "body": speech})
    if not prepared:
        raise SkillError("too_short", "README does not contain enough prose to narrate")

    selected: list[dict[str, str]] = []
    seen: set[int] = set()

    def add(index: int, role: str) -> None:
        if index in seen:
            return
        seen.add(index)
        item = dict(prepared[index])
        item["role"] = role
        selected.append(item)

    intro_at = next((i for i, item in enumerate(prepared) if item["role"] == "intro"), None)
    add(0 if intro_at is None else intro_at, "intro")
    for role in ("overview", "setup", "usage", "caveats"):
        match = next((i for i, item in enumerate(prepared) if item["role"] == role), None)
        if match is not None:
            add(match, role)
    for index, item in enumerate(prepared):
        add(index, item["role"])

    sections: list[dict[str, object]] = []
    total = 0
    for item in selected:
        if len(sections) >= MAX_SECTIONS:
            break
        room = MAX_TOTAL_CHARS - total
        if room < 40:
            break
        text = cap_text(compose(item["title"], item["body"]), min(MAX_SECTION_CHARS, room))
        if len(text) < 20:
            continue
        total += len(text)
        sections.append(
            {
                "index": len(sections) + 1,
                "role": item["role"],
                "title": item["title"],
                "text": text,
                "chars": len(text),
            }
        )
    if total < MIN_TOTAL_CHARS or not sections:
        raise SkillError(
            "too_short",
            f"Spoken script is shorter than {MIN_TOTAL_CHARS} characters. Provide a longer README.",
        )
    payload: dict[str, object] = {
        "ok": True,
        "voice_mode": "single",
        "multi_voice": False,
        "spoken_chars": total,
        "section_count": len(sections),
        "limits": {
            "max_sections": MAX_SECTIONS,
            "max_section_chars": MAX_SECTION_CHARS,
            "max_total_chars": MAX_TOTAL_CHARS,
            "min_total_chars": MIN_TOTAL_CHARS,
        },
        "sections": sections,
    }
    if source_url:
        payload["source_url"] = source_url
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a short single-voice script from a README.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--source-url", default="")
    args = parser.parse_args(argv)
    try:
        markdown = read_input(args.input)
        payload = build_script(markdown, source_url=args.source_url or None)
        target = resolve_temp_destination(args.out)
        partial = target.parent / f".{target.name}.partial"
        partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(partial, target)
        payload["out"] = str(target)
    except SkillError as exc:
        payload = {"ok": False, "error": exc.code, "message": str(exc)}
        json.dump(payload, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        print(str(exc), file=sys.stderr)
        return 2
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

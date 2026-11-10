#!/usr/bin/env python3
"""Remove a docu-voice work directory created under the system temp dir.

Refuses any path that is not a real directory whose name starts with
docu-voice- and whose resolved location is under temp. Does not follow a
symlink directory.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

PREFIX = "docu-voice-"


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


def cleanup(path: str) -> dict[str, object]:
    raw = Path(path)
    if not raw.is_absolute():
        raise SkillError("unsafe_path", "Work directory must be an absolute path")
    if raw.is_symlink():
        raise SkillError("unsafe_path", "Refusing to remove a symlink")
    if not raw.exists() or not raw.is_dir():
        raise SkillError("unsafe_path", "Work directory does not exist")
    resolved = raw.resolve()
    roots = temp_roots()
    if resolved in roots or not any(root in resolved.parents for root in roots):
        raise SkillError("unsafe_path", "Refusing to remove a directory outside a docu-voice temp folder")
    if not resolved.name.startswith(PREFIX):
        raise SkillError("unsafe_path", f"Directory name must start with {PREFIX}")
    shutil.rmtree(resolved)
    return {"ok": True, "removed": str(resolved)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Remove a docu-voice-* temp work directory.")
    parser.add_argument("--dir", required=True)
    args = parser.parse_args(argv)
    try:
        payload = cleanup(args.dir)
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

"""
ROM library scanner.

Walks the configured ROMS folder and classifies every disc image / game file
into a console (PS1 / PS2 / PSP).

Organisation strategy
----------------------
1. Folder-based (preferred & most reliable):
       ROMS/PS1/...   ROMS/PS2/...   ROMS/PSP/...
   Aliases are accepted (e.g. "playstation", "psx", "ps_one" -> PS1).

2. Extension-based fallback for files that are NOT inside a recognised
   console sub-folder. Ambiguous extensions like ".iso" are only assigned
   when they map to a single console.

For multi-file PS1 games (.cue + .bin / .img tracks) only the playable entry
point (the .cue, or a lone .bin) is shown so the grid is not polluted with
individual track files.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .config import CONSOLES


# Folder name -> console id. Lets users name their sub-folders naturally.
FOLDER_ALIASES: dict[str, str] = {
    "ps1": "PS1", "psx": "PS1", "playstation": "PS1", "playstation1": "PS1",
    "ps_one": "PS1", "psone": "PS1",
    "ps2": "PS2", "playstation2": "PS2",
    "psp": "PSP", "playstationportable": "PSP",
}

# Extensions that belong to exactly one console -> safe for the fallback path.
_UNAMBIGUOUS_EXT: dict[str, str] = {}
_AMBIGUOUS_EXT: set[str] = set()


def _build_extension_index() -> None:
    seen: dict[str, set[str]] = {}
    for cid, meta in CONSOLES.items():
        for ext in meta["extensions"]:
            seen.setdefault(ext, set()).add(cid)
    for ext, owners in seen.items():
        if len(owners) == 1:
            _UNAMBIGUOUS_EXT[ext] = next(iter(owners))
        else:
            _AMBIGUOUS_EXT.add(ext)


_build_extension_index()

# Track files we never want to surface on their own when a .cue exists.
_SECONDARY_TRACK_EXT = {".bin", ".img", ".mdf", ".ecm"}


@dataclass(frozen=True)
class Game:
    """A single launchable title."""

    title: str           # cleaned, human-friendly name
    path: str            # absolute path passed to the emulator
    console_id: str      # "PS1" | "PS2" | "PSP"

    @property
    def console_name(self) -> str:
        return CONSOLES[self.console_id]["name"]


def _clean_title(filename: str) -> str:
    """Turn 'God_of_War.[USA].v1.2.iso' into 'God of War'."""
    stem = Path(filename).stem
    # Drop common dump tags in (), [] and trailing region/version noise.
    out, depth = [], 0
    for ch in stem:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth = max(0, depth - 1)
        elif depth == 0:
            out.append(ch)
    cleaned = "".join(out)
    cleaned = cleaned.replace("_", " ").replace(".", " ").strip()
    # Collapse repeated whitespace.
    cleaned = " ".join(cleaned.split())
    return cleaned or stem


def _console_from_path_parts(rel_parts: tuple[str, ...]) -> str | None:
    """Return a console id if any folder in the path matches an alias."""
    for part in rel_parts:
        key = part.lower().replace(" ", "").replace("-", "")
        if key in FOLDER_ALIASES:
            return FOLDER_ALIASES[key]
    return None


def scan(roms_folder: str) -> dict[str, list[Game]]:
    """
    Scan `roms_folder` and return {console_id: [Game, ...]} sorted by title.

    Missing or empty folders simply yield empty lists, never an exception.
    """
    result: dict[str, list[Game]] = {cid: [] for cid in CONSOLES}

    if not roms_folder or not os.path.isdir(roms_folder):
        return result

    root = Path(roms_folder)

    for dirpath, _dirnames, filenames in os.walk(root):
        cur = Path(dirpath)
        rel_parts = cur.relative_to(root).parts

        # Detect if any .cue exists here so we can hide secondary track files.
        cue_present = any(f.lower().endswith(".cue") for f in filenames)

        for fname in filenames:
            ext = Path(fname).suffix.lower()

            # 1) Decide which console this file belongs to.
            console_id = _console_from_path_parts(rel_parts)
            if console_id is None:
                console_id = _UNAMBIGUOUS_EXT.get(ext)
            if console_id is None:
                # Ambiguous extension with no folder hint -> skip silently.
                continue

            # Only accept extensions valid for the resolved console.
            if ext not in CONSOLES[console_id]["extensions"]:
                continue

            # 2) Avoid listing individual track files when a .cue is present.
            if cue_present and ext in _SECONDARY_TRACK_EXT:
                continue

            game = Game(
                title=_clean_title(fname),
                path=str(cur / fname),
                console_id=console_id,
            )
            result[console_id].append(game)

    for cid in result:
        result[cid].sort(key=lambda g: g.title.lower())

    return result


def flatten(library: dict[str, list[Game]]) -> list[Game]:
    """All games across every console as one list, sorted by title."""
    games = [g for games in library.values() for g in games]
    games.sort(key=lambda g: g.title.lower())
    return games

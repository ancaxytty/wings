"""
Configuration management for the Console Launcher.

Stores emulator executable paths and the ROMs library location in a JSON file
next to the application so settings persist between runs (and survive being
frozen into an .exe with PyInstaller).
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, asdict, field
from pathlib import Path


# --------------------------------------------------------------------------- #
#  Console catalogue
# --------------------------------------------------------------------------- #
# Each console maps to:
#   - a friendly display name
#   - the emulator config key used to look up the executable path
#   - the file extensions that identify a ROM/disc image for that system
#
# Note: ".iso" is ambiguous (used by both PS2 and PSP). The scanner resolves
# this primarily by the sub-folder a ROM lives in (ROMS/PS2, ROMS/PSP, ...),
# falling back to extension only for the unambiguous cases.
CONSOLES: dict[str, dict] = {
    "PS1": {
        "name": "PlayStation",
        "emulator_key": "duckstation",
        "extensions": [".cue", ".bin", ".chd", ".img", ".pbp", ".ecm", ".mdf"],
        "accent": "#1c6fd6",
    },
    "PS2": {
        "name": "PlayStation 2",
        "emulator_key": "pcsx2",
        "extensions": [".iso", ".chd", ".bin", ".cso", ".gz"],
        "accent": "#0b3d91",
    },
    "PSP": {
        "name": "PSP",
        "emulator_key": "ppsspp",
        "extensions": [".iso", ".cso", ".pbp", ".chd"],
        "accent": "#5b2a86",
    },
}


def app_dir() -> Path:
    """
    Directory where the app lives. When frozen by PyInstaller (--onefile)
    sys.executable points to the temporary exe, so we use its folder to keep
    the config next to the binary the user actually launches.
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


CONFIG_PATH = app_dir() / "launcher_config.json"


@dataclass
class Config:
    """User-editable settings."""

    roms_folder: str = ""
    emulators: dict[str, str] = field(
        default_factory=lambda: {
            "duckstation": "",
            "pcsx2": "",
            "ppsspp": "",
        }
    )
    # Optional extra CLI flags per emulator, e.g. {"pcsx2": "-fullscreen -nogui"}
    emulator_args: dict[str, str] = field(default_factory=dict)

    # ----------------------------------------------------------------- #
    @classmethod
    def load(cls) -> "Config":
        if CONFIG_PATH.exists():
            try:
                data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
                cfg = cls()
                cfg.roms_folder = data.get("roms_folder", "")
                # Merge so newly added emulator keys are preserved.
                cfg.emulators.update(data.get("emulators", {}))
                cfg.emulator_args = data.get("emulator_args", {})
                return cfg
            except (json.JSONDecodeError, OSError):
                # Corrupt config -> fall back to defaults rather than crashing.
                pass
        return cls()

    def save(self) -> None:
        CONFIG_PATH.write_text(
            json.dumps(asdict(self), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    # ----------------------------------------------------------------- #
    def emulator_for(self, console_id: str) -> str:
        """Return the configured emulator path for a console id (PS1/PS2/PSP)."""
        key = CONSOLES[console_id]["emulator_key"]
        return self.emulators.get(key, "")

    def args_for(self, console_id: str) -> list[str]:
        """Return extra CLI args for a console's emulator as a token list."""
        key = CONSOLES[console_id]["emulator_key"]
        raw = self.emulator_args.get(key, "")
        return raw.split() if raw else []

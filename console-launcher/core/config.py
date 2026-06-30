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


def resource_path(name: str) -> Path:
    """
    Locate a bundled resource (e.g. app.ico) whether running from source or
    from a PyInstaller --onefile build (which extracts data to sys._MEIPASS).
    """
    base = getattr(sys, "_MEIPASS", None)
    if base:
        candidate = Path(base) / name
        if candidate.exists():
            return candidate
    return app_dir() / name


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


# Per-emulator flag that forces fullscreen on launch.
FULLSCREEN_FLAGS: dict[str, str] = {
    "duckstation": "-fullscreen",
    "pcsx2": "-fullscreen",
    "ppsspp": "--fullscreen",
}


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

    # --- Apariencia / comportamiento -------------------------------------
    color_theme: str = "Azul PlayStation"   # nombre en theme.COLOR_THEMES
    card_size: str = "Mediana"              # Pequeña / Mediana / Grande
    launch_fullscreen: bool = False         # añade el flag de pantalla completa
    close_on_launch: bool = False           # minimiza el launcher al jugar
    confirm_launch: bool = False            # pide confirmación antes de jugar

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
                cfg.color_theme = data.get("color_theme", cfg.color_theme)
                cfg.card_size = data.get("card_size", cfg.card_size)
                cfg.launch_fullscreen = data.get("launch_fullscreen", cfg.launch_fullscreen)
                cfg.close_on_launch = data.get("close_on_launch", cfg.close_on_launch)
                cfg.confirm_launch = data.get("confirm_launch", cfg.confirm_launch)
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
        tokens = raw.split() if raw else []
        if self.launch_fullscreen:
            flag = FULLSCREEN_FLAGS.get(key)
            if flag and flag not in tokens:
                tokens.append(flag)
        return tokens

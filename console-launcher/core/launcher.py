"""
Emulator launcher.

Builds the correct command line for a given game and starts the external
emulator with subprocess.Popen so the GUI stays responsive (non-blocking).
"""

from __future__ import annotations

import os
import subprocess
import sys

from .config import Config, CONSOLES
from .scanner import Game


class LaunchError(Exception):
    """Raised when a game cannot be launched (clear, user-facing message)."""


def launch(game: Game, config: Config) -> subprocess.Popen:
    """
    Launch `game` using the emulator configured for its console.

    Raises LaunchError with a friendly message on any predictable problem
    (emulator not set / not found, ROM missing). Returns the Popen handle.
    """
    emulator = config.emulator_for(game.console_id)
    console = CONSOLES[game.console_id]["name"]

    if not emulator:
        raise LaunchError(
            f"No has configurado el emulador para {console}.\n"
            f"Ve a Ajustes y selecciona el ejecutable correspondiente."
        )
    if not os.path.isfile(emulator):
        raise LaunchError(
            f"No se encontró el emulador de {console} en:\n{emulator}\n"
            f"Revisa la ruta en Ajustes."
        )
    if not os.path.exists(game.path):
        raise LaunchError(f"No se encontró la ROM:\n{game.path}")

    # Order matters for some emulators: <exe> [flags] <rom>
    cmd = [emulator, *config.args_for(game.console_id), game.path]

    try:
        # On Windows, avoid spawning an extra console window for the child.
        creationflags = 0
        if sys.platform.startswith("win"):
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

        return subprocess.Popen(
            cmd,
            cwd=os.path.dirname(emulator) or None,
            creationflags=creationflags,
        )
    except OSError as exc:
        raise LaunchError(f"No se pudo iniciar el emulador:\n{exc}") from exc

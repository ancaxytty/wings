"""
Emulator launcher.

Builds the correct command line for a given game and starts the external
emulator with subprocess.Popen so the GUI stays responsive (non-blocking).

The emulator path is resolved automatically (see emulator_finder) so the user
usually does not need to configure anything: just drop portable emulators in
the `emulators/` folder next to the app.
"""

from __future__ import annotations

import os
import subprocess
import sys

from .config import Config, CONSOLES
from . import emulator_finder
from .scanner import Game


class LaunchError(Exception):
    """Raised when a game cannot be launched (clear, user-facing message)."""


def resolve_emulator(console_id: str, config: Config) -> str:
    """Effective emulator path for a console (configured or auto-detected)."""
    key = CONSOLES[console_id]["emulator_key"]
    return emulator_finder.resolve(key, config.emulator_for(console_id))


def launch(game: Game, config: Config) -> subprocess.Popen:
    """
    Launch `game` using the emulator for its console (auto-detected if needed).

    Raises LaunchError with a friendly message on any predictable problem.
    Returns the Popen handle.
    """
    console = CONSOLES[game.console_id]["name"]
    emulator = resolve_emulator(game.console_id, config)

    if not emulator:
        raise LaunchError(
            f"No se encontró un emulador para {console}.\n\n"
            f"Coloca el emulador (portable) dentro de la carpeta:\n"
            f"   emulators/{CONSOLES[game.console_id]['emulator_key']}\n"
            f"que está junto a la aplicación, y se detectará solo.\n"
            f"(También puedes indicar la ruta manualmente en Ajustes.)"
        )
    if not os.path.isfile(emulator):
        raise LaunchError(
            f"El emulador de {console} no existe en:\n{emulator}"
        )
    if not os.path.exists(game.path):
        raise LaunchError(f"No se encontró la ROM:\n{game.path}")

    # Order matters for some emulators: <exe> [flags] <rom>
    cmd = [emulator, *config.args_for(game.console_id), game.path]

    try:
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

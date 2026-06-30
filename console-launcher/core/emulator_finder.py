"""
Detección automática de emuladores.

Objetivo: que el usuario NO tenga que configurar rutas manualmente.

Para cada consola buscamos el ejecutable del emulador en este orden:
  1. La ruta que el usuario haya fijado en Ajustes (si existe).
  2. La carpeta portable  <app>/emulators/<clave>/   (recursivo).
  3. La carpeta portable  <app>/emulators/          (recursivo).
  4. Rutas de instalación comunes del sistema.
  5. El PATH del sistema (shutil.which).

Así, si el usuario simplemente deja los emuladores portables dentro de la
carpeta `emulators/`, la app los reconoce sola y se puede jugar sin tocar nada.
"""

from __future__ import annotations

import os
import shutil
import sys
from functools import lru_cache
from pathlib import Path

from .config import app_dir

# Nombres de ejecutable conocidos por emulador (Windows + Linux/Mac).
EXECUTABLE_NAMES: dict[str, list[str]] = {
    "duckstation": [
        "duckstation-qt-x64-ReleaseLTCG.exe",
        "duckstation-nogui-x64-ReleaseLTCG.exe",
        "duckstation-qt.exe", "duckstation.exe", "DuckStation.exe",
        "duckstation-qt", "duckstation",
    ],
    "pcsx2": [
        "pcsx2-qt.exe", "pcsx2x64-avx2.exe", "pcsx2x64.exe", "pcsx2.exe", "PCSX2.exe",
        "pcsx2-qt", "pcsx2",
    ],
    "ppsspp": [
        "PPSSPPWindows64.exe", "PPSSPPWindows.exe", "PPSSPP.exe",
        "PPSSPPSDL", "PPSSPPQt", "ppsspp",
    ],
}

# Nombres de carpeta típicos donde la gente instala estos emuladores.
_COMMON_FOLDER_HINTS: dict[str, list[str]] = {
    "duckstation": ["DuckStation", "duckstation"],
    "pcsx2": ["PCSX2", "pcsx2", "PCSX2-Qt"],
    "ppsspp": ["PPSSPP", "ppsspp"],
}


def emulators_dir() -> Path:
    """Carpeta portable donde el usuario puede dejar los emuladores."""
    return app_dir() / "emulators"


def _common_base_dirs() -> list[Path]:
    bases: list[Path] = []
    if sys.platform.startswith("win"):
        for env in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA", "USERPROFILE"):
            val = os.environ.get(env)
            if val:
                bases.append(Path(val))
        up = os.environ.get("USERPROFILE")
        if up:
            bases += [Path(up) / "Desktop", Path(up) / "Downloads"]
    else:
        home = Path.home()
        bases += [home, home / "Applications", Path("/opt"),
                  Path("/usr/bin"), Path("/usr/local/bin")]
    return [b for b in bases if b.is_dir()]


def _scan_for_names(root: Path, names: list[str], max_depth: int = 4) -> str | None:
    """Busca cualquiera de `names` bajo `root` hasta cierta profundidad."""
    if not root.is_dir():
        return None
    lower = {n.lower() for n in names}
    root_depth = len(root.parts)
    for dirpath, dirnames, filenames in os.walk(root):
        depth = len(Path(dirpath).parts) - root_depth
        if depth > max_depth:
            dirnames[:] = []
            continue
        for f in filenames:
            if f.lower() in lower:
                return str(Path(dirpath) / f)
    return None


@lru_cache(maxsize=None)
def detect(key: str) -> str:
    """
    Devuelve la ruta del emulador para una clave (duckstation/pcsx2/ppsspp),
    o "" si no se encuentra. El resultado se cachea por sesión.
    """
    names = EXECUTABLE_NAMES.get(key, [])
    if not names:
        return ""

    # 2) Carpeta portable emulators/<key>/ y emulators/
    emu_dir = emulators_dir()
    for root in (emu_dir / key, emu_dir):
        found = _scan_for_names(root, names)
        if found:
            return found

    # 3) Rutas comunes (probando primero las subcarpetas con nombre conocido)
    for base in _common_base_dirs():
        for hint in _COMMON_FOLDER_HINTS.get(key, []):
            found = _scan_for_names(base / hint, names, max_depth=3)
            if found:
                return found

    # 4) PATH del sistema
    for n in names:
        which = shutil.which(n)
        if which:
            return which

    return ""


def clear_cache() -> None:
    """Olvida los resultados cacheados (tras re-escanear o cambiar ajustes)."""
    detect.cache_clear()


def resolve(key: str, configured_path: str) -> str:
    """
    Ruta efectiva del emulador: usa la configurada si es válida; si no,
    intenta la detección automática.
    """
    if configured_path and os.path.isfile(configured_path):
        return configured_path
    return detect(key)

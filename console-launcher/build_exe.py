"""
Empaqueta Nexus Game Center en un único .exe usando PyInstaller.

Uso:
    pip install pyinstaller
    python build_exe.py

El resultado queda en la carpeta ./dist/

Nota: CustomTkinter y Pillow incluyen archivos de datos que PyInstaller no
detecta solo, por eso usamos --collect-all para incluirlos.
"""

import subprocess
import sys
import os

APP_NAME = "NexusGameCenter"
ENTRY = "main.py"


def main() -> int:
    sep = ";" if sys.platform.startswith("win") else ":"
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconsole",
        "--onefile",
        "--name", APP_NAME,
        "--collect-all", "customtkinter",
        "--collect-all", "PIL",
        "--clean",
        "--noconfirm",
    ]
    if os.path.exists("app.ico"):
        cmd += ["--icon", "app.ico", "--add-data", f"app.ico{sep}."]
    cmd.append(ENTRY)
    print("Ejecutando:\n  " + " ".join(cmd) + "\n")
    try:
        subprocess.run(cmd, check=True)
    except FileNotFoundError:
        print("ERROR: PyInstaller no está instalado. Ejecuta: pip install pyinstaller")
        return 1
    except subprocess.CalledProcessError as exc:
        print(f"ERROR: el empaquetado falló (código {exc.returncode}).")
        return exc.returncode

    print(f"\n✔ Listo. Encuentra tu ejecutable en: dist/{APP_NAME}"
          + (".exe" if sys.platform.startswith("win") else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

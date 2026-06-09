#!/usr/bin/env python3
"""Empaqueta el addon WorldEdit MCPE en un .mcaddon versionado dentro de dist/.

Estructura:
  worldedit_src/WorldEditBP  -> WorldEdit_BP.mcpack  (manifest.json en la raíz)
  worldedit_src/WorldEditRP  -> WorldEdit_RP.mcpack
  ambos .mcpack              -> dist/WorldEdit_v<version>.mcaddon

Uso:  python3 worldedit_src/_build.py
"""
import io
import json
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DIST = os.path.join(ROOT, "dist")

BP_DIR = os.path.join(HERE, "WorldEditBP")
RP_DIR = os.path.join(HERE, "WorldEditRP")


def read_version() -> str:
    with open(os.path.join(BP_DIR, "manifest.json"), encoding="utf-8") as fh:
        data = json.load(fh)
    v = data["header"]["version"]
    return ".".join(str(x) for x in v)


def zip_dir_to_bytes(folder: str) -> bytes:
    """Zip the *contents* of folder so manifest.json sits at the archive root."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for base, _dirs, files in os.walk(folder):
            for name in files:
                full = os.path.join(base, name)
                rel = os.path.relpath(full, folder)
                zf.write(full, rel.replace(os.sep, "/"))
    return buf.getvalue()


def main() -> None:
    os.makedirs(DIST, exist_ok=True)
    version = read_version()

    bp_pack = zip_dir_to_bytes(BP_DIR)
    rp_pack = zip_dir_to_bytes(RP_DIR)

    out = os.path.join(DIST, f"WorldEdit_v{version}.mcaddon")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("WorldEdit_BP.mcpack", bp_pack)
        zf.writestr("WorldEdit_RP.mcpack", rp_pack)

    print(f"OK -> {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Package the WorldEdit behavior pack into a .mcaddon (zip) file.

A .mcaddon is just a ZIP archive containing the pack folder(s). When opened,
Minecraft reads each subfolder's manifest.json and imports it.
"""
import json
import os
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PACK_DIR = os.path.join(ROOT, "WorldEditBP")
OUTPUT = os.path.join(ROOT, "worldedit_mcpe_fifa_wc2026.mcaddon")


def validate_manifest():
    path = os.path.join(PACK_DIR, "manifest.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)  # raises if invalid JSON
    assert "header" in data and "uuid" in data["header"], "manifest header/uuid missing"
    assert any(m.get("type") == "script" for m in data.get("modules", [])), "no script module"
    print("manifest.json OK ->", data["header"]["uuid"])


def build():
    if not os.path.isdir(PACK_DIR):
        print("ERROR: pack dir not found:", PACK_DIR)
        sys.exit(1)
    validate_manifest()

    if os.path.exists(OUTPUT):
        os.remove(OUTPUT)

    count = 0
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for base, _dirs, files in os.walk(PACK_DIR):
            for name in files:
                full = os.path.join(base, name)
                # arcname keeps the WorldEditBP/ folder inside the zip
                arc = os.path.relpath(full, ROOT)
                zf.write(full, arc)
                count += 1
                print("  +", arc)

    size = os.path.getsize(OUTPUT)
    print(f"\nBuilt {OUTPUT} ({count} files, {size} bytes)")


if __name__ == "__main__":
    build()

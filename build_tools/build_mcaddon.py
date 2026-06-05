#!/usr/bin/env python3
"""Package the WorldEdit packs into a .mcaddon (zip) file.

A .mcaddon is just a ZIP archive containing the pack folder(s). When opened,
Minecraft reads each subfolder's manifest.json and imports it. This addon
ships TWO packs:
  - WorldEditBP : the behavior pack (scripts / all the logic).
  - WorldEditRP : the resource pack (custom JSON-UI menu skin + textures).
"""
import json
import os
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PACK_DIRS = [
    os.path.join(ROOT, "WorldEditBP"),
    os.path.join(ROOT, "WorldEditRP"),
]
OUTPUT = os.path.join(ROOT, "worldedit_mcpe_fifa_wc2026.mcaddon")


def validate_manifest(pack_dir):
    path = os.path.join(pack_dir, "manifest.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)  # raises if invalid JSON
    assert "header" in data and "uuid" in data["header"], "manifest header/uuid missing"
    assert data.get("modules"), "no modules in manifest"
    print("manifest OK ->", os.path.basename(pack_dir), data["header"]["uuid"])


def validate_json_files(pack_dir):
    """Parse every .json under the pack so a typo can't slip into the build."""
    for base, _dirs, files in os.walk(pack_dir):
        for name in files:
            if name.endswith(".json"):
                full = os.path.join(base, name)
                with open(full, "r", encoding="utf-8") as f:
                    json.load(f)


def build():
    for pack_dir in PACK_DIRS:
        if not os.path.isdir(pack_dir):
            print("ERROR: pack dir not found:", pack_dir)
            sys.exit(1)
        validate_manifest(pack_dir)
        validate_json_files(pack_dir)

    if os.path.exists(OUTPUT):
        os.remove(OUTPUT)

    count = 0
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for pack_dir in PACK_DIRS:
            for base, _dirs, files in os.walk(pack_dir):
                for name in files:
                    full = os.path.join(base, name)
                    # arcname keeps the pack folder (WorldEditBP/ , WorldEditRP/) inside the zip
                    arc = os.path.relpath(full, ROOT)
                    zf.write(full, arc)
                    count += 1
                    print("  +", arc)

    size = os.path.getsize(OUTPUT)
    print(f"\nBuilt {OUTPUT} ({count} files, {size} bytes)")


if __name__ == "__main__":
    build()

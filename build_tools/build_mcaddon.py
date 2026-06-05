#!/usr/bin/env python3
"""Package the WorldEdit behavior + resource packs into a .mcaddon (zip) file.

A .mcaddon is just a ZIP archive containing the pack folder(s). When opened,
Minecraft reads each subfolder's manifest.json and imports it.

This addon ships TWO packs:
  - WorldEditBP : the behavior pack (all the WorldEdit logic / scripts).
  - WorldEditRP : a resource pack that gives the menus a custom, professional
                  look (custom server form). It is purely cosmetic; the BP
                  works on its own if the RP is removed.
The BP manifest depends on the RP (by uuid) so the RP auto-applies.
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
    assert data.get("modules"), "manifest has no modules"
    kinds = ", ".join(sorted({m.get("type", "?") for m in data["modules"]}))
    print(f"  manifest.json OK -> {os.path.basename(pack_dir)} [{kinds}] {data['header']['uuid']}")
    return data


def build():
    missing = [p for p in PACK_DIRS if not os.path.isdir(p)]
    if missing:
        print("ERROR: pack dir(s) not found:", ", ".join(missing))
        sys.exit(1)

    print("Validating manifests:")
    for p in PACK_DIRS:
        validate_manifest(p)

    if os.path.exists(OUTPUT):
        os.remove(OUTPUT)

    count = 0
    print("\nPackaging:")
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for pack_dir in PACK_DIRS:
            for base, _dirs, files in os.walk(pack_dir):
                for name in files:
                    full = os.path.join(base, name)
                    # arcname keeps each pack's folder (WorldEditBP/ , WorldEditRP/) inside the zip
                    arc = os.path.relpath(full, ROOT)
                    zf.write(full, arc)
                    count += 1
                    print("  +", arc)

    size = os.path.getsize(OUTPUT)
    print(f"\nBuilt {OUTPUT} ({count} files, {size} bytes)")


if __name__ == "__main__":
    build()

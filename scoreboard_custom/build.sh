#!/usr/bin/env bash
# Re-genera los assets y empaqueta el .mcaddon
set -e
cd "$(dirname "$0")"

VERSION="V0.1"
OUT="dist/ScoreboardCustom${VERSION}.mcaddon"

echo "[1/3] Generando assets..."
python3 _gen_assets.py

echo "[2/3] Limpiando build anterior..."
mkdir -p dist
rm -f "$OUT"

echo "[3/3] Empaquetando $OUT ..."
zip -r -X "$OUT" ScoreboardCustom_BP ScoreboardCustom_RP \
  -x "*.DS_Store" -x "__MACOSX*" >/dev/null

echo "Hecho -> $OUT"
unzip -l "$OUT" | tail -n 3

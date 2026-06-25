#!/usr/bin/env bash
# MC Hosting Panel - lanzador para macOS / Linux
set -e
cd "$(dirname "$0")"

echo "=================================================="
echo "           MC HOSTING PANEL - Inicio"
echo "=================================================="

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js no encontrado. Instálalo desde https://nodejs.org"
  exit 1
fi
echo "[OK] Node.js $(node -v)"

if ! command -v java >/dev/null 2>&1; then
  echo "[AVISO] Java no encontrado. Lo necesitas para iniciar el servidor."
  echo "        Descárgalo desde https://adoptium.net"
fi

if [ ! -d node_modules ]; then
  echo "[OK] Cero dependencias: no hace falta npm install."
fi

( sleep 3; (command -v xdg-open >/dev/null && xdg-open http://localhost:8080) \
  || (command -v open >/dev/null && open http://localhost:8080) ) &

echo "[..] Panel en http://localhost:8080"
node server.js

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PYTHON="$(command -v python3 || command -v python || true)"
if [[ -z "$PYTHON" ]]; then
  echo "Python 3 was not found. Open index.html directly or install Python."
  exit 1
fi
URL="http://127.0.0.1:5500"
echo "Starting PromptForge Studio by Shark on $URL"
(
  sleep 1
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true
  fi
) &
exec "$PYTHON" -m http.server 5500

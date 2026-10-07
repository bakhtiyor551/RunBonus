#!/usr/bin/env bash
set -euo pipefail
URL="${1:-http://127.0.0.1/health}"
TRIES="${2:-30}"
SLEEP="${3:-2}"

for i in $(seq 1 "$TRIES"); do
  if curl -fsS "$URL" >/tmp/runbonus-health.json 2>/dev/null; then
    echo "[runbonus] health ok ($URL)"
    cat /tmp/runbonus-health.json
    echo
    exit 0
  fi
  echo "[runbonus] health retry $i/$TRIES"
  sleep "$SLEEP"
done

echo "[runbonus] health FAILED ($URL)" >&2
exit 1

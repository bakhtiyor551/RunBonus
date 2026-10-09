#!/usr/bin/env bash
# Health check. Из Jenkins (Docker-in-Docker) 127.0.0.1 — это сам Jenkins,
# поэтому по умолчанию проверяем через docker exec в контейнер API.
set -euo pipefail

URL="${1:-${HEALTH_URL:-http://127.0.0.1:3000/health}}"
TRIES="${2:-30}"
SLEEP="${3:-2}"
CONTAINER="${HEALTH_CONTAINER:-runbonus-api}"

probe() {
  # 1) Предпочтительно: curl внутри API-контейнера (работает из Jenkins)
  if [[ -n "$CONTAINER" ]] && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
    docker exec "$CONTAINER" curl -fsS http://127.0.0.1:3000/health
    return $?
  fi
  # 2) Fallback: прямой HTTP (когда скрипт на хосте)
  curl -fsS "$URL"
}

for i in $(seq 1 "$TRIES"); do
  if out="$(probe 2>/dev/null)"; then
    echo "[runbonus] health ok (container=${CONTAINER:-n/a} url=$URL)"
    echo "$out"
    echo
    exit 0
  fi
  echo "[runbonus] health retry $i/$TRIES"
  sleep "$SLEEP"
done

echo "[runbonus] health FAILED (container=${CONTAINER:-n/a} url=$URL)" >&2
docker ps -a --filter "name=${CONTAINER}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' >&2 || true
docker logs "$CONTAINER" --tail 40 >&2 || true
exit 1

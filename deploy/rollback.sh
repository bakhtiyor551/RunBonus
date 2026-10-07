#!/usr/bin/env bash
# Возврат предыдущего Docker image. Не трогает volumes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/deploy/lib.sh"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
PREV="${1:-}"
if [[ -z "$PREV" && -f "$ROOT/.release.previous" ]]; then
  PREV="$(tr -d '[:space:]' <"$ROOT/.release.previous")"
fi
[[ -n "$PREV" ]] || die "Нет предыдущего тега. Передайте: ./deploy/rollback.sh 1.0.2"

log "rollback → runbonus-api:$PREV"
IMAGE_TAG="$PREV" compose_cmd up -d --no-deps api
export IMAGE_TAG="$PREV"
"$ROOT/deploy/save-release.sh"
"$ROOT/deploy/health-wait.sh" "${HEALTH_URL:-http://127.0.0.1/health}"
log "rollback complete"

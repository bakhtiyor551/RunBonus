#!/usr/bin/env bash
# Сборка и выкат без `docker compose down -v`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/deploy/lib.sh"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG required}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1/health}"
ENV_FILE="${ENV_FILE:-.env}"

require_env_file "$ENV_FILE"
"$ROOT/deploy/ensure-certs.sh"

never_down_volumes "$@"

if [[ "$SKIP_BACKUP" != "1" ]]; then
  "$ROOT/deploy/backup-db.sh" || log "backup skipped/failed (первый деплой без MySQL — допустимо)"
fi

log "build api image runbonus-api:$IMAGE_TAG"
IMAGE_TAG="$IMAGE_TAG" compose_cmd build api
docker tag "runbonus-api:$IMAGE_TAG" "runbonus-api:git-${GIT_SHA:-local}"

if [[ "$SKIP_MIGRATE" != "1" ]]; then
  log "migration"
  IMAGE_TAG="$IMAGE_TAG" compose_cmd run --rm --no-deps api node src/migrate.js
fi

log "up (без удаления volumes)"
IMAGE_TAG="$IMAGE_TAG" compose_cmd up -d
"$ROOT/deploy/save-release.sh"
"$ROOT/deploy/health-wait.sh" "$HEALTH_URL"
log "deploy complete $IMAGE_TAG"

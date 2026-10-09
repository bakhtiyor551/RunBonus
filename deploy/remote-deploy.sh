#!/usr/bin/env bash
# Сборка и выкат без `docker compose down -v`.
# Порядок: ensure mysql → backup → migration → up all → health
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
NOTIFY_DEPLOY_STAGES="${NOTIFY_DEPLOY_STAGES:-0}"

notify_stage() {
  local status="$1"
  local stage="$2"
  if [[ "$NOTIFY_DEPLOY_STAGES" != "1" ]]; then
    return 0
  fi
  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    return 0
  fi
  STATUS="$status" \
    STAGE="$stage" \
    ENVIRONMENT="${DEPLOY_ENV:-${ENVIRONMENT:-production}}" \
    VERSION="${VERSION:-$IMAGE_TAG}" \
    COMMIT="${COMMIT:-${GIT_SHA:-}}" \
    BUILD_URL="${BUILD_URL:-}" \
    "$ROOT/deploy/jenkins-notify.sh" || true
}

require_env_file "$ENV_FILE"
"$ROOT/deploy/ensure-certs.sh"

never_down_volumes "$@"

log "build api image runbonus-api:$IMAGE_TAG"
IMAGE_TAG="$IMAGE_TAG" compose_cmd build api
docker tag "runbonus-api:$IMAGE_TAG" "runbonus-api:git-${GIT_SHA:-local}" || true

log "start mysql + redis (данные в volumes)"
IMAGE_TAG="$IMAGE_TAG" compose_cmd up -d mysql redis

log "wait mysql healthy"
MYSQL_CID=""
for i in $(seq 1 60); do
  MYSQL_CID="$(compose_cmd ps -q mysql 2>/dev/null || true)"
  if [[ -n "$MYSQL_CID" ]]; then
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$MYSQL_CID" 2>/dev/null || true)"
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      # MariaDB image has healthcheck → wait for healthy; if no health, running is enough after a short settle
      if [[ "$status" == "healthy" ]]; then
        log "mysql ready ($status)"
        break
      fi
    fi
    if [[ "$status" == "running" ]] && [[ "$i" -ge 5 ]]; then
      # fallback when healthcheck not yet reported
      if docker exec "$MYSQL_CID" healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1 \
        || docker exec "$MYSQL_CID" mysqladmin ping -h127.0.0.1 --silent >/dev/null 2>&1; then
        log "mysql ready (ping ok)"
        break
      fi
    fi
  fi
  sleep 2
  if [[ "$i" -eq 60 ]]; then
    die "mysql не стал healthy за 120с"
  fi
done

if [[ "$SKIP_BACKUP" != "1" ]]; then
  ALLOW_SKIP_BACKUP=1 "$ROOT/deploy/backup-db.sh"
fi

if [[ "$SKIP_MIGRATE" != "1" ]]; then
  notify_stage RUNNING "Миграции БД"
  log "migration"
  if IMAGE_TAG="$IMAGE_TAG" compose_cmd run --rm --no-deps api node src/migrate.js; then
    notify_stage STAGE_OK "Миграции БД"
  else
    notify_stage STAGE_FAIL "Миграции БД"
    exit 1
  fi
fi

notify_stage RUNNING "Деплой"
log "up all services (без удаления volumes)"
if IMAGE_TAG="$IMAGE_TAG" compose_cmd up -d \
  && "$ROOT/deploy/save-release.sh"; then
  notify_stage STAGE_OK "Деплой"
else
  notify_stage STAGE_FAIL "Деплой"
  exit 1
fi

# Health Check stage в Jenkinsfile дублирует проверку; здесь оставляем для ручных запусков
if [[ "${SKIP_HEALTH_IN_DEPLOY:-0}" != "1" ]]; then
  "$ROOT/deploy/health-wait.sh" "$HEALTH_URL"
fi
log "deploy complete $IMAGE_TAG"

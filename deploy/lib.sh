#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { echo "[runbonus] $*"; }
die() { echo "[runbonus] ERROR: $*" >&2; exit 1; }

compose_cmd() {
  local file="${COMPOSE_FILE:-docker-compose.prod.yml}"
  local envf="${ENV_FILE:-.env}"
  docker compose --env-file "$envf" -f "$file" "$@"
}

require_env_file() {
  local file="${1:-.env}"
  [[ -f "$file" ]] || die "Нет $file — скопируйте из .env.example и заполните секреты на VPS"
}

never_down_volumes() {
  if [[ "$*" == *"-v"* ]] || [[ "$*" == *"--volumes"* ]]; then
    die "docker compose down -v запрещён: удалит mysql_data/redis_data"
  fi
}

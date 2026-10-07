#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { echo "[runbonus] $*"; }
die() { echo "[runbonus] ERROR: $*" >&2; exit 1; }

compose_bin() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
  else
    die "Нет docker compose (установите docker-compose-v2 / CLI plugin)"
  fi
}

compose_cmd() {
  local file="${COMPOSE_FILE:-docker-compose.prod.yml}"
  # .env уже в корне проекта (prepare-env.sh) — Compose подхватывает его сам.
  # Не передаём --env-file: без CLI-plugin флаг ошибочно уходит в `docker`.
  # shellcheck disable=SC2046
  $(compose_bin) -f "$file" "$@"
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

#!/usr/bin/env bash
# Готовит .env в каталоге проекта для docker compose.
# Источник (по приоритету):
#   1) RUNBONUS_ENV_FILE
#   2) /opt/runbonus/.env
#   3) $JENKINS_HOME/runbonus.env
#   4) уже существующий ./.env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEST="${1:-$ROOT/.env}"
CANDIDATES=(
  "${RUNBONUS_ENV_FILE:-}"
  /opt/runbonus/.env
  "${JENKINS_HOME:-/var/jenkins_home}/runbonus.env"
  "$ROOT/.env"
)

SRC=""
for f in "${CANDIDATES[@]}"; do
  [[ -n "$f" && -f "$f" ]] || continue
  SRC="$f"
  break
done

if [[ -z "$SRC" ]]; then
  cat >&2 <<'EOF'
[runbonus] ERROR: не найден production .env

Создайте один раз (секреты НЕ в Git):

  sudo mkdir -p /opt/runbonus
  sudo cp /path/to/backend/.env /opt/runbonus/.env
  # либо: sudo cp .env.example /opt/runbonus/.env  и заполните пароли

Для Docker обязательно:
  DB_HOST=mysql
  REDIS_URL=redis://redis:6379
  MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD / MYSQL_ROOT_PASSWORD
  PORT=3000

Затем перезапустите Jenkins job.
EOF
  exit 1
fi

if [[ "$(readlink -f "$SRC" 2>/dev/null || echo "$SRC")" != "$(readlink -f "$DEST" 2>/dev/null || echo "$DEST")" ]]; then
  cp -f "$SRC" "$DEST"
fi
chmod 600 "$DEST" 2>/dev/null || true
echo "[runbonus] env ready: $DEST (from $SRC)"

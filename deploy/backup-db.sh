#!/usr/bin/env bash
# Daily/weekly/monthly dumps. Не печатает пароли.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/deploy/lib.sh"

BACKUP_ROOT="${BACKUP_ROOT:-/backup/runbonus}"
STAMP="$(date -u +%Y-%m-%d)"
DAY="$(date -u +%d)"
WEEKDAY="$(date -u +%u)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly" "$BACKUP_ROOT/monthly"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

MYSQL_DATABASE="${MYSQL_DATABASE:-runbonus}"
MYSQL_USER="${MYSQL_USER:-runbonus}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
CONTAINER="${MYSQL_CONTAINER:-runbonus-mysql}"

dump_one() {
  local dest="$1"
  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    docker exec "$CONTAINER" sh -c 'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --single-transaction --routines --databases "$MYSQL_DATABASE"' \
      >"$dest.tmp"
  elif command -v mysqldump >/dev/null 2>&1; then
    mysqldump -h"${DB_HOST:-127.0.0.1}" -P"${DB_PORT:-3306}" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" \
      --single-transaction --routines --databases "$MYSQL_DATABASE" >"$dest.tmp"
  else
    die "Нет контейнера $CONTAINER и нет mysqldump на хосте"
  fi
  gzip -c "$dest.tmp" >"$dest"
  rm -f "$dest.tmp"
  log "backup written $dest ($(du -h "$dest" | awk '{print $1}'))"
}

DAILY="$BACKUP_ROOT/daily/runbonus_${STAMP}.sql.gz"
dump_one "$DAILY"

if [[ "$WEEKDAY" == "7" ]]; then
  cp -f "$DAILY" "$BACKUP_ROOT/weekly/runbonus_${STAMP}.sql.gz"
fi
if [[ "$DAY" == "01" ]]; then
  cp -f "$DAILY" "$BACKUP_ROOT/monthly/runbonus_${STAMP}.sql.gz"
fi

# Ротация: 14 daily, 8 weekly, 12 monthly
ls -1t "$BACKUP_ROOT/daily"/runbonus_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$BACKUP_ROOT/weekly"/runbonus_*.sql.gz 2>/dev/null | tail -n +9 | xargs -r rm -f
ls -1t "$BACKUP_ROOT/monthly"/runbonus_*.sql.gz 2>/dev/null | tail -n +13 | xargs -r rm -f

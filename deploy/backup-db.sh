#!/usr/bin/env bash
# Daily/weekly/monthly dumps. Не печатает пароли.
# На первом деплое (нет runbonus-mysql и нет источника) — warning и exit 0.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/deploy/lib.sh"

BACKUP_ROOT="${BACKUP_ROOT:-/backup/runbonus}"
STAMP="$(date -u +%Y-%m-%d)"
DAY="$(date -u +%d)"
WEEKDAY="$(date -u +%u)"
CONTAINER="${MYSQL_CONTAINER:-runbonus-mysql}"
ALLOW_SKIP="${ALLOW_SKIP_BACKUP:-1}"

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

has_container() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"
}

dump_one() {
  local dest="$1"
  if has_container; then
    docker exec -e MYSQL_PWD="$MYSQL_PASSWORD" "$CONTAINER" \
      mysqldump -u"$MYSQL_USER" --single-transaction --routines --databases "$MYSQL_DATABASE" \
      >"$dest.tmp"
  elif command -v mysqldump >/dev/null 2>&1; then
    MYSQL_PWD="$MYSQL_PASSWORD" mysqldump \
      -h"${DB_HOST:-127.0.0.1}" -P"${DB_PORT:-3306}" -u"$MYSQL_USER" \
      --single-transaction --routines --databases "$MYSQL_DATABASE" >"$dest.tmp"
  else
    return 2
  fi
  gzip -c "$dest.tmp" >"$dest"
  rm -f "$dest.tmp"
  log "backup written $dest ($(du -h "$dest" | awk '{print $1}'))"
}

DAILY="$BACKUP_ROOT/daily/runbonus_${STAMP}.sql.gz"
if ! dump_one "$DAILY"; then
  if [[ "$ALLOW_SKIP" == "1" ]]; then
    log "backup skipped: нет контейнера $CONTAINER и нет mysqldump (первый деплой — ок)"
    exit 0
  fi
  die "Нет контейнера $CONTAINER и нет mysqldump на хосте"
fi

if [[ "$WEEKDAY" == "7" ]]; then
  cp -f "$DAILY" "$BACKUP_ROOT/weekly/runbonus_${STAMP}.sql.gz"
fi
if [[ "$DAY" == "01" ]]; then
  cp -f "$DAILY" "$BACKUP_ROOT/monthly/runbonus_${STAMP}.sql.gz"
fi

rotate() {
  local dir="$1"
  local keep="$2"
  local -a files=()
  local -a sorted=()
  [[ -d "$dir" ]] || return 0
  shopt -s nullglob
  files=("$dir"/runbonus_*.sql.gz)
  shopt -u nullglob
  # Пустой glob → не вызывать ls без аргументов (иначе ls листит CWD и rm бьёт по database/).
  ((${#files[@]} == 0)) && return 0
  mapfile -t sorted < <(ls -1t "${files[@]}")
  local i
  for ((i = keep; i < ${#sorted[@]}; i++)); do
    rm -f "${sorted[i]}"
  done
}

rotate "$BACKUP_ROOT/daily" 14
rotate "$BACKUP_ROOT/weekly" 8
rotate "$BACKUP_ROOT/monthly" 12
log "backup complete"

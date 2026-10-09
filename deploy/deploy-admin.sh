#!/usr/bin/env bash
# Сборка Vite admin и выкладка статики в каталог nginx (по умолчанию /opt/runbonus/admin/dist).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/deploy/lib.sh"

ADMIN_DIR="${ADMIN_DIR:-$ROOT/admin}"
DEST="${ADMIN_DIST_DIR:-/opt/runbonus/admin/dist}"
STAGING="${ADMIN_STAGING_DIR:-/tmp/runbonus-admin-dist.$$}"

[[ -f "$ADMIN_DIR/package.json" ]] || die "нет $ADMIN_DIR/package.json"

log "admin npm ci"
(
  cd "$ROOT"
  CI_DIR=admin ./deploy/ci-node.sh npm ci
)

log "admin vite build"
(
  cd "$ROOT"
  CI_DIR=admin ./deploy/ci-node.sh npm run build
)

[[ -f "$ADMIN_DIR/dist/index.html" ]] || die "после build нет $ADMIN_DIR/dist/index.html"

log "publish admin → $DEST"
rm -rf "$STAGING"
mkdir -p "$STAGING"
# dist может быть создан root'ом в Docker — копируем содержимое
cp -a "$ADMIN_DIR/dist/." "$STAGING/"
mkdir -p "$DEST"
# атомарная замена через rsync/delete, если rsync есть; иначе rm+cp
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$STAGING/" "$DEST/"
else
  find "$DEST" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  cp -a "$STAGING/." "$DEST/"
fi
rm -rf "$STAGING"

# сброс кэша nginx index (no-cache уже в конфиге; reload на всякий случай)
if command -v nginx >/dev/null 2>&1; then
  nginx -t >/dev/null 2>&1 && nginx -s reload >/dev/null 2>&1 || true
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -qx runbonus-nginx; then
  docker exec runbonus-nginx nginx -s reload >/dev/null 2>&1 || true
fi

log "admin deployed ($(date -u +%Y-%m-%dT%H:%MZ))"

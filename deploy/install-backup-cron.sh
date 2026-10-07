#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRON_FILE=/etc/cron.d/runbonus-backup
mkdir -p /backup/runbonus
cat >"$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 2 * * * root BACKUP_ROOT=/backup/runbonus COMPOSE_FILE=docker-compose.prod.yml $ROOT/deploy/backup-db.sh >> /var/log/runbonus-backup.log 2>&1
EOF
chmod 644 "$CRON_FILE"
echo "installed $CRON_FILE (daily 02:00 UTC); weekly/monthly copies создаёт backup-db.sh"

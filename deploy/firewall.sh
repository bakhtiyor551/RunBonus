#!/usr/bin/env bash
# Открыть только 22/80/443. Не открывать 3306, 6379, 3000.
set -euo pipefail
if ! command -v ufw >/dev/null 2>&1; then
  echo "ufw не установлен. Пример iptables: allow 22,80,443; deny 3306,6379,3000"
  exit 0
fi
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose

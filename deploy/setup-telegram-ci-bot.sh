#!/usr/bin/env bash
# Создаёт /opt/runbonus/telegram-ci.env и поднимает контейнер бота.
# Секреты только из env / аргументов — не из Git.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${TELEGRAM_CI_ENV_FILE:-/opt/runbonus/telegram-ci.env}"

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_ALLOWED_CHAT_IDS="${TELEGRAM_ALLOWED_CHAT_IDS:-${TELEGRAM_CHAT_ID:-}}"
JENKINS_USER="${JENKINS_USER:-}"
JENKINS_API_TOKEN="${JENKINS_API_TOKEN:-}"
JENKINS_JOB_PATH="${JENKINS_JOB_PATH:-RunBonus/master}"
JENKINS_URL="${JENKINS_URL:-http://jenkins:8080}"

if [[ -z "$TELEGRAM_BOT_TOKEN" || -z "$TELEGRAM_ALLOWED_CHAT_IDS" || -z "$JENKINS_USER" || -z "$JENKINS_API_TOKEN" ]]; then
  cat <<'USAGE' >&2
Usage (все переменные обязательны):

  export TELEGRAM_BOT_TOKEN='...'
  export TELEGRAM_ALLOWED_CHAT_IDS='123456789'
  export JENKINS_USER='bakhtiyor'
  export JENKINS_API_TOKEN='...'   # Jenkins → user → Configure → API Token
  sudo -E ./deploy/setup-telegram-ci-bot.sh

Опционально: JENKINS_JOB_PATH=RunBonus/master JENKINS_URL=http://jenkins:8080
USAGE
  exit 1
fi

sudo mkdir -p "$(dirname "$OUT")"
umask 077
sudo tee "$OUT" >/dev/null <<EOF
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_ALLOWED_CHAT_IDS=${TELEGRAM_ALLOWED_CHAT_IDS}
TELEGRAM_CHAT_ID=${TELEGRAM_ALLOWED_CHAT_IDS%%,*}
JENKINS_URL=${JENKINS_URL}
JENKINS_USER=${JENKINS_USER}
JENKINS_API_TOKEN=${JENKINS_API_TOKEN}
JENKINS_JOB_PATH=${JENKINS_JOB_PATH}
EOF
sudo chmod 600 "$OUT"
echo "[runbonus] wrote $OUT"

cd "$ROOT"
docker compose -f docker-compose.jenkins.yml up -d --build telegram-ci-bot
echo "[runbonus] telegram-ci-bot started"
echo "[runbonus] В Jenkins Credentials задайте TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (тот же бот и chat id) для уведомлений этапов."

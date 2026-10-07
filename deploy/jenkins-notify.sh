#!/usr/bin/env bash
# TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID передаются из Jenkins Credentials, не из Git.
set -euo pipefail

STATUS="${STATUS:-UNKNOWN}"
ENVIRONMENT="${ENVIRONMENT:-unknown}"
STAGE="${STAGE:-}"
VERSION="${VERSION:-}"
COMMIT="${COMMIT:-}"
BUILD_URL="${BUILD_URL:-}"

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  echo "[notify] telegram credentials missing — skip"
  exit 0
fi

if [[ "$STATUS" == "SUCCESS" ]]; then
  TEXT=$(printf '🚀 RunBonus Deploy\n\nEnvironment: %s\n\nVersion:\n%s\n\nStatus:\n✅ SUCCESS\n\nCommit:\n%s\n' \
    "$ENVIRONMENT" "$VERSION" "$COMMIT")
else
  TEXT=$(printf '🚨 RunBonus Deploy FAILED\n\nEnvironment:\n%s\n\nStage:\n%s\n\nCommit:\n%s\n\nStatus:\n❌ FAILED\n' \
    "$ENVIRONMENT" "${STAGE:-unknown}" "$COMMIT")
fi
if [[ -n "$BUILD_URL" ]]; then
  TEXT+=$'\n\n'"$BUILD_URL"
fi

curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${TEXT}" >/dev/null || echo "[notify] telegram send failed"

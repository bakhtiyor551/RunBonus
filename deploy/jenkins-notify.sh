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

case "$STATUS" in
  RUNNING|START)
    TEXT=$(printf '⏳ %s\n\nЭтап выполняется…\nEnv: %s\nVersion: %s\nCommit: %s' \
      "${STAGE:-Pipeline}" "$ENVIRONMENT" "${VERSION:-—}" "${COMMIT:-—}")
    ;;
  STAGE_OK|STAGE_SUCCESS)
    TEXT=$(printf '✅ %s\n\nЭтап завершён успешно.\nEnv: %s\nVersion: %s\nCommit: %s' \
      "${STAGE:-Pipeline}" "$ENVIRONMENT" "${VERSION:-—}" "${COMMIT:-—}")
    ;;
  STAGE_FAIL|STAGE_FAILED)
    TEXT=$(printf '❌ %s\n\nЭтап завершился ошибкой.\nEnv: %s\nVersion: %s\nCommit: %s' \
      "${STAGE:-Pipeline}" "$ENVIRONMENT" "${VERSION:-—}" "${COMMIT:-—}")
    ;;
  SUCCESS)
    TEXT=$(printf '🚀 RunBonus Deploy\n\nEnvironment: %s\nVersion: %s\nStatus: ✅ SUCCESS\nCommit: %s' \
      "$ENVIRONMENT" "${VERSION:-—}" "${COMMIT:-—}")
    ;;
  FAILED|FAILURE)
    TEXT=$(printf '🚨 RunBonus Deploy FAILED\n\nEnvironment: %s\nStage: %s\nCommit: %s\nStatus: ❌ FAILED' \
      "$ENVIRONMENT" "${STAGE:-unknown}" "${COMMIT:-—}")
    ;;
  *)
    TEXT=$(printf 'RunBonus CI/CD\nStatus: %s\nStage: %s\nEnv: %s' \
      "$STATUS" "${STAGE:-—}" "$ENVIRONMENT")
    ;;
esac

if [[ -n "$BUILD_URL" ]]; then
  TEXT+=$'\n\n'"$BUILD_URL"
fi

curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${TEXT}" >/dev/null || echo "[notify] telegram send failed"

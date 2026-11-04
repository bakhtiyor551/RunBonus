#!/bin/sh
set -e
# Volume api_uploads часто создаётся от root — чиним права до старта от app.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/uploads/order-receipts /app/uploads/avatars /app/uploads/products
  chown -R app:app /app/uploads
  exec su-exec app /usr/local/bin/runbonus-api "$@"
fi
exec /usr/local/bin/runbonus-api "$@"

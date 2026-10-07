#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/docker/nginx/certs"
mkdir -p "$CERT_DIR"

if [[ -f "$CERT_DIR/fullchain.pem" && -f "$CERT_DIR/privkey.pem" ]]; then
  exit 0
fi

if [[ -d /etc/letsencrypt/live ]]; then
  live="$(find /etc/letsencrypt/live -mindepth 1 -maxdepth 1 -type d | head -n 1 || true)"
  if [[ -n "${live:-}" && -f "$live/fullchain.pem" ]]; then
    cp -L "$live/fullchain.pem" "$CERT_DIR/fullchain.pem"
    cp -L "$live/privkey.pem" "$CERT_DIR/privkey.pem"
    chmod 644 "$CERT_DIR/fullchain.pem"
    chmod 600 "$CERT_DIR/privkey.pem"
    echo "[runbonus] SSL: скопированы сертификаты из $live"
    exit 0
  fi
fi

echo "[runbonus] SSL: создаю self-signed сертификат (замените на Let's Encrypt)"
openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -keyout "$CERT_DIR/privkey.pem" \
  -out "$CERT_DIR/fullchain.pem" \
  -subj "/CN=api.runbonus.tj"
chmod 600 "$CERT_DIR/privkey.pem"

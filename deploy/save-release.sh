#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${IMAGE_TAG:?IMAGE_TAG required}"
if [[ -f "$ROOT/.release" ]]; then
  cp -f "$ROOT/.release" "$ROOT/.release.previous"
fi
printf '%s\n' "$TAG" >"$ROOT/.release"
echo "[runbonus] current image tag: $TAG"

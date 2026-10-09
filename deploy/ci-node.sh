#!/usr/bin/env bash
# Запуск npm внутри node-образа. Если Jenkins сам в Docker (docker.sock),
# bind-mount пути агента на хосте нет — подключаем те же volumes, что у Jenkins.
set -euo pipefail

IMAGE="${NODE_CI_IMAGE:-node:22-bookworm}"
CI_DIR="${CI_DIR:-backend}"
WORKDIR="${PWD}/${CI_DIR}"

if [[ ! -f "${WORKDIR}/package-lock.json" && ! -f "${WORKDIR}/package.json" ]]; then
  echo "ci-node: нет package.json в ${WORKDIR}" >&2
  ls -la "${WORKDIR}" >&2 || true
  exit 1
fi

if [[ -f /.dockerenv && -S /var/run/docker.sock ]]; then
  exec docker run --rm --volumes-from "$(hostname)" -w "${WORKDIR}" "${IMAGE}" "$@"
fi

exec docker run --rm -v "${WORKDIR}:/app" -w /app "${IMAGE}" "$@"

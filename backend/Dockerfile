# syntax=docker/dockerfile:1
# Контекст сборки — корень репозитория (см. docker-compose).
# Backend на Node.js (ESM), без TypeScript: вход — src/index.js.

FROM node:22-alpine AS builder

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
COPY database ./database

RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache curl \
  && addgroup -S runbonus \
  && adduser -S runbonus -G runbonus

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
# backend/src/* резолвит ../../database → /database (как в репозитории)
COPY --from=builder /app/database /database

RUN mkdir -p /app/uploads \
  && chown -R runbonus:runbonus /app

USER runbonus

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

CMD ["node", "src/index.js"]

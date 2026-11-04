# syntax=docker/dockerfile:1
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/runbonus-api ./cmd/api

FROM alpine:3.22
# tzdata: даты в БД читаются в часовом поясе процесса — задайте TZ в окружении.
# su-exec: entrypoint чинит права volume uploads и понижает привилегии до app.
RUN apk add --no-cache ca-certificates tzdata wget su-exec \
  && adduser -D -H app \
  && mkdir -p /app/uploads/order-receipts /app/uploads/avatars /app/uploads/products \
  && chown -R app:app /app
COPY --from=build /out/runbonus-api /usr/local/bin/runbonus-api
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
WORKDIR /app
ENV PORT=3000 TZ=Asia/Dushanbe UPLOADS_ROOT=/app/uploads
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
ENTRYPOINT ["/docker-entrypoint.sh"]

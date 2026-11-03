# syntax=docker/dockerfile:1
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/runbonus-api ./cmd/api

FROM alpine:3.22
# tzdata: даты в БД читаются в поясе процесса (как у Node) — задайте TZ в окружении.
RUN apk add --no-cache ca-certificates tzdata && adduser -D -H app
COPY --from=build /out/runbonus-api /usr/local/bin/runbonus-api
USER app
ENV GO_PORT=8080 TZ=Asia/Dushanbe UPLOADS_ROOT=/data/uploads
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${GO_PORT}/api/health || exit 1
ENTRYPOINT ["runbonus-api"]

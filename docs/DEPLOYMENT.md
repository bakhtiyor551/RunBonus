# Деплой и продакшен

## Backend на сервере

API написан на Go (`backend/`). На production поднимается в Docker Compose-стеке `runbonus` (api + MySQL + Redis) на порту **3000**; хостовый nginx проксирует сюда.

### Требования

- Docker с compose-плагином (или Go 1.27+ для сборки бинарника)
- MySQL/MariaDB (в стеке — сервис `mysql`)
- nginx (reverse proxy на хосте)
- SSL-сертификат (Let's Encrypt)

### Шаги (Docker, production)

```bash
# корень репозитория / workspace Jenkins
cp .env.example .env   # или готовый /var/jenkins_home/.../.env
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm api setup-db /app/database
docker compose -f docker-compose.prod.yml run --rm api seed   # только первый раз
```

API слушает `127.0.0.1:3000`. Uploads — volume `api_uploads`, секреты — `backend/secrets`. Обновление: Jenkins (`Jenkinsfile`, параметр `DEPLOY`) или `docker compose -f docker-compose.prod.yml up -d --build api`.

### Без Docker (systemd)

```bash
cd backend && go build -o /usr/local/bin/runbonus-api ./cmd/api
```

Unit-файл: `WorkingDirectory=/var/www/RunBonus/backend`, `ExecStart=/usr/local/bin/runbonus-api`, `Restart=always`. `.env` читается из рабочего каталога.

### Переход с прежнего Node.js API

Выполнено на production: systemd/Node остановлены, образ `runbonus-api` в стеке `docker-compose.prod.yml` — Go, nginx → `:3000`. Утренний отчёт шлёт сам API (`JOBS=true`).

Подробности и найденные при переносе баги — в [GO_MIGRATION.md](GO_MIGRATION.md).

### nginx (пример)

```nginx
server {
    listen 443 ssl;
    server_name runbonus.online;

    ssl_certificate     /etc/letsencrypt/live/runbonus.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/runbonus.online/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
    }

    # WebSocket: тренировка в приложении и Live GPS в админке
    location ~ ^/(app/workout|admin/live-tracking)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
}
```

### Production `.env`

```env
PORT=3000
NODE_ENV=production
TZ=Asia/Dushanbe
DB_HOST=127.0.0.1
DB_USER=runbonus
DB_PASSWORD=<strong-password>
DB_NAME=runbonus
JWT_SECRET=<random-64-chars>
JWT_ADMIN_SECRET=<random-64-chars>
PUBLIC_API_URL=https://runbonus.online
SMS_LOGIN=...
SMS_TOKEN=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

## Mobile (production build)

Release-сборка всегда ходит на `https://runbonus.online` (`productionApiUrl` в `mobile/lib/core/config.dart`).

```bash
cd mobile
flutter build appbundle   # Android (Google Play)
flutter build ipa         # iOS (только Mac)
```

## Admin (production build)

```bash
cd admin
npm run build
```

Раздавайте `admin/dist/` через nginx:

```nginx
location /admin/ {
    alias /var/www/runbonus/admin/dist/;
    try_files $uri $uri/ /admin/index.html;
}
```

Или отдельный поддомен `admin.runbonus.online`.

## iOS App Store

Подробная инструкция: [deploy/IOS.md](../deploy/IOS.md)

Кратко:

1. Mac + Xcode + Apple Developer Account.
2. `cd mobile && flutter build ipa`.
3. Upload в App Store Connect / TestFlight.

## DNS

См. [deploy/DNS.md](../deploy/DNS.md) для настройки домена.

## Чеклист перед релизом

- [ ] Сменить `JWT_SECRET` и `JWT_ADMIN_SECRET`
- [ ] Настроить SMS (OsonSMS)
- [ ] Пополнить бонусный фонд в админке
- [ ] SSL на API
- [ ] `productionApiUrl` в мобильном приложении указывает на HTTPS
- [ ] Firebase для push (опционально)
- [ ] Telegram для уведомлений о заказах/выводах
- [ ] Резервное копирование MySQL

## Мониторинг

- Health check: `GET /api/health`
- Логи: `docker compose logs -f api` (в `backend/`)
- Ежедневный отчёт в Telegram: 08:00 (если настроен `TELEGRAM_*` и `JOBS=true`). Отправить вручную:

```bash
docker compose run --rm api daily-report
```

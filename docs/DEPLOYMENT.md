# Деплой и продакшен

## Backend на сервере

API написан на Go (`backend/`). Запускается одним бинарником или в Docker на порту **3001**.

### Требования

- Docker с compose-плагином (или Go 1.27+ для сборки бинарника)
- MySQL 8
- nginx (reverse proxy)
- SSL-сертификат (Let's Encrypt)

### Шаги (Docker)

```bash
cd backend
cp .env.example .env          # заполните production-значения
docker compose up -d --build  # API на 127.0.0.1:3001
docker compose run --rm api setup-db /app/database   # схема и миграции
docker compose run --rm api seed                     # только первый раз
```

Папки `backend/uploads` (аватары, чеки) и `backend/secrets` (Firebase) монтируются в контейнер. Обновление: `git pull && docker compose up -d --build` или Jenkins (`Jenkinsfile`, параметр `DEPLOY`).

### Без Docker (systemd)

```bash
cd backend && go build -o /usr/local/bin/runbonus-api ./cmd/api
```

Unit-файл: `WorkingDirectory=/var/www/RunBonus/backend`, `ExecStart=/usr/local/bin/runbonus-api`, `Restart=always`. `.env` читается из рабочего каталога.

### Переход с прежнего Node.js API

`.env`, `uploads/` и `secrets/` остаются в `backend/` — Go читает их там же. Порядок:

1. `pm2 stop runbonus-api && pm2 delete runbonus-api && pm2 save`.
2. `git pull`, затем `docker compose up -d --build`.
3. Удалите cron `node scripts/dailyReport.js`, если был: утренний отчёт теперь отправляет сам API (`JOBS=true`).

Подробности и найденные при переносе баги — в [GO_MIGRATION.md](GO_MIGRATION.md).

### nginx (пример)

```nginx
server {
    listen 443 ssl;
    server_name runbonus.online;

    ssl_certificate     /etc/letsencrypt/live/runbonus.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/runbonus.online/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
    }

    # WebSocket: тренировка в приложении и Live GPS в админке
    location ~ ^/(app/workout|admin/live-tracking)$ {
        proxy_pass http://127.0.0.1:3001;
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
PORT=3001
NODE_ENV=production
TZ=Asia/Dushanbe
DB_HOST=localhost
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

# Деплой и продакшен

## Backend на сервере

### Требования

- Node.js 18+
- MySQL 8
- nginx (рекомендуется reverse proxy)
- SSL-сертифисат (Let's Encrypt)

### Шаги

```bash
cd backend
npm install --production
cp .env.example .env
# Заполните production-значения
npm run db:setup
npm run seed   # только первый раз
npm start
```

### PM2 (рекомендуется)

```bash
npm install -g pm2
pm2 start src/index.js --name runbonus-api
pm2 save
pm2 startup
```

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
}
```

### Production `.env`

```env
PORT=3001
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

`mobile/.env.production`:

```env
VITE_API_URL=https://runbonus.online
```

```bash
cd mobile
npm run build:release   # Android
npm run build:ios       # iOS
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
2. `npm run build:ios` → `pod install` → Xcode Archive.
3. Upload в App Store Connect / TestFlight.

## DNS

См. [deploy/DNS.md](../deploy/DNS.md) для настройки домена.

## Чеклист перед релизом

- [ ] Сменить `JWT_SECRET` и `JWT_ADMIN_SECRET`
- [ ] Настроить SMS (OsonSMS)
- [ ] Пополнить бонусный фонд в админке
- [ ] SSL на API
- [ ] `VITE_API_URL` указывает на HTTPS
- [ ] Firebase для push (опционально)
- [ ] Telegram для уведомлений о заказах/выводах
- [ ] Резервное копирование MySQL

## Мониторинг

- Health check: `GET /api/health`
- Логи PM2: `pm2 logs runbonus-api`
- Ежедневный отчёт в Telegram: 08:00 (если настроен `TELEGRAM_*`)

```bash
cd backend && npm run report:daily
```

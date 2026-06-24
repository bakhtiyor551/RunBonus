# Быстрый старт

Пошаговая установка RunBonus на локальной машине (Windows). Docker не используется.

## 1. MySQL

1. Установите [MySQL Server 8](https://dev.mysql.com/downloads/).
2. Создайте базу и пользователя:

```sql
CREATE DATABASE IF NOT EXISTS runbonus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'runbonus'@'localhost' IDENTIFIED BY 'runbonus';
GRANT ALL PRIVILEGES ON runbonus.* TO 'runbonus'@'localhost';
FLUSH PRIVILEGES;
```

## 2. Backend

```bash
cd backend
copy .env.example .env
npm install
npm run db:init
npm run dev
```

API будет доступен на `http://localhost:3001` и по IP вашего ПК в локальной сети.

Проверка: `GET http://localhost:3001/api/health` → `{"ok":true,...}`

### Переменные `.env`

| Переменная | Назначение |
|------------|------------|
| `PORT` | Порт API (по умолчанию 3001) |
| `DB_*` | Подключение к MySQL |
| `JWT_SECRET` | Токен пользователей |
| `JWT_ADMIN_SECRET` | Токен админов |
| `SMS_*` | OsonSMS для OTP-входа |
| `TELEGRAM_*` | Уведомления о выводах и заказах |
| `FIREBASE_*` | Push-уведомления |

## 3. Мобильное приложение

```bash
cd mobile
copy .env.example .env
npm install
npm run dev
```

В `mobile/.env`:

```env
VITE_API_URL=http://localhost:3001
```

Для теста на **физическом телефоне** укажите IP компьютера:

```env
VITE_API_URL=http://192.168.1.100:3001
```

### Android

```bash
npm run build:release
npx cap open android
```

Сборка APK в Android Studio: **Build → Build Bundle(s) / APK(s)**.

### iOS (только Mac)

```bash
npm run build:ios
cd ios/App && pod install
npx cap open ios
```

Подробнее: [deploy/IOS.md](../deploy/IOS.md) и [MOBILE.md](MOBILE.md).

## 4. Админ-панель

```bash
cd admin
npm install
npm run dev
```

Откройте `http://localhost:5174`, войдите: **admin** / **admin123**.

## 5. Тестовые данные (seed)

После `npm run seed` в backend:

| Сущность | Значение |
|----------|----------|
| Админ | `admin` / `admin123` |
| Кроссовки (QR) | `SHOE-DEMO-001` |
| Бонусный фонд | 10 000 сомони |

## 6. Первый сценарий

1. Запустите backend, mobile, admin.
2. В приложении: регистрация по SMS (или `SMS_DEV_CODE` в `.env` для разработки).
3. Активируйте кроссовки по QR `SHOE-DEMO-001`.
4. Начните тренировку — GPS, шаги, дистанция.
5. В админке → **Тренировки** → блок **Live GPS** для просмотра маршрута клиента.

## Частые проблемы

| Проблема | Решение |
|----------|---------|
| Телефон не видит API | `VITE_API_URL` = IP ПК, backend слушает `0.0.0.0`, одна Wi‑Fi сеть |
| GPS не работает | Разрешения геолокации, GPS включён, тест на улице |
| Ошибка MySQL | Проверьте `DB_*` в `.env`, выполните `npm run db:setup` |
| SMS не приходит | Настройте `SMS_*` или `SMS_DEV_CODE=123456` для dev |

# RunBonus — «Бегай и получай бонусы»

MVP: мобильное приложение + API + админ-панель. **Docker не используется** — только локальный MySQL.

## Требования

- [Node.js](https://nodejs.org/) 18+
- [MySQL](https://dev.mysql.com/downloads/) 8 (локально на Windows)

## 1. База данных (локальный MySQL)

1. Установите MySQL Server и запомните логин/пароль (часто `root`).
2. Создайте пользователя и БД (в MySQL Workbench или `mysql -u root -p`):

```sql
CREATE DATABASE IF NOT EXISTS runbonus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'runbonus'@'localhost' IDENTIFIED BY 'runbonus';
GRANT ALL PRIVILEGES ON runbonus.* TO 'runbonus'@'localhost';
FLUSH PRIVILEGES;
```

3. Создайте таблицы **одним из способов**:

**Способ A (проще)** — из папки `backend` после `npm install`:

```bash
npm run db:setup
```

**Способ B** — через MySQL:

```bash
mysql -u runbonus -p runbonus < database/schema.sql
```

Или откройте `database/schema.sql` в MySQL Workbench и выполните скрипт.

## 2. Backend

```bash
cd backend
copy .env.example .env
npm install
npm run db:setup
npm run seed
npm run dev
```

Или одной командой: `npm run db:init` (создаёт таблицы + тестовые данные).

API: `http://localhost:3001`

В `.env` укажите свои данные MySQL, если они отличаются:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=runbonus
DB_PASSWORD=runbonus
DB_NAME=runbonus
```

**Тестовые данные после seed:**
- Админка: `admin` / `admin123`
- Код кроссовок: `SHOE-DEMO-001`

## 3. Мобильное приложение

```bash
cd mobile
npm install
npm run dev
```

Откройте в браузере (для GPS на телефоне — сборка через Capacitor).

В `mobile/.env` при необходимости:

```
VITE_API_URL=http://localhost:3001
```

Для Android (нужны [Android Studio](https://developer.android.com/studio) и JDK 17):

```bash
cd mobile
npm install
copy .env.example .env
# В .env укажите IP вашего ПК: VITE_API_URL=http://192.168.x.x:3001
npm run build
npx cap sync android
ionic cap run android
# или: npm run cap:android
# или открыть в Android Studio: npm run cap:open
```

## 4. Админ-панель

```bash
cd admin
npm install
npm run dev
```

Откройте `http://localhost:5174`, войдите: `admin` / `admin123`.

## Бонусные счета (фонд компании)

Бонусы клиентам списываются с **бонусного фонда** компании (таблицы `accounts`, `account_transactions`).

1. В админке: раздел **«Бонусные счета»** — открыть счёт типа `bonus_fund`, пополнить остаток.
2. После тренировки: компания **−N** сомони, клиент **+N** на кошелёк (`user_bonus_wallets`).
3. Если на фонде недостаточно средств — бонус не начисляется, статус тренировки `rejected_no_fund`.

После обновления схемы выполните:

```bash
cd backend
npm run db:setup
npm run seed
```

Тестовый фонд после seed: **«Бонусный фонд RunBonus»**, 10 000 сомони.

## Правила бонусов

| Правило | Значение |
|--------|----------|
| За 1 км | 3 сомони бонусами |
| Дневной лимит | 10 сомони |
| Лимит на одну пару | 200 сомони |
| Мин. дистанция | 500 м |
| Мин. время | 5 минут |

Текст в приложении: **бонусы и скидка**, не «реальные деньги».

## Структура

```
runbonus/
  backend/     — Node.js + Express + MySQL
  mobile/      — Ionic React + Capacitor
  admin/       — React (Vite)
  database/    — schema.sql
```

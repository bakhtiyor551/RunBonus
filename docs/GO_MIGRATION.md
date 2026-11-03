# Миграция backend: Node.js → Go (завершена)

API RunBonus переписан с Node.js (Express, mysql2, ws) на Go. Код Node удалён, Go лежит в `backend/`. На production — контейнер `runbonus-api` в `docker-compose.prod.yml` (порт **3000**, рядом mysql/redis). `.env`, uploads и БД те же. nginx, админка и мобильное приложение изменений не требуют.

## Этапы

| # | Этап | Где в Go |
|---|------|----------|
| 1 | Аудит Node.js API и БД | раздел ниже |
| 2 | Каркас: конфиг, БД, JWT, CORS, статика `uploads` | `internal/{config,db,httpx,auth,server}` |
| 3 | Auth и Users: SMS-вход, пароль, профиль, аватар, привязка устройства | `internal/users` |
| 4 | Shoes и QR | `internal/shoes` |
| 5 | Workouts и GPS: REST, WS `/app/workout`, Live GPS `/admin/live-tracking` | `internal/workouts` |
| 6 | Anti-Fraud: фильтр точек, проверка трека, скорость > 60 км/ч | `internal/gps` |
| 7 | Progress: `/api/me`, прогресс по км, рейтинг | `internal/rewards` |
| 8 | Награды и задания | `internal/rewards`, `internal/challenges` |
| 9 | Shop и Orders, реклама | `internal/shop`, `internal/ads` |
| 10 | Firebase (FCM HTTP v1) и Telegram | `internal/notify` |
| — | Админка `/api/admin/**`, отчёты, утренний отчёт | `internal/admin`, `internal/reports` |
| 11 | Docker + Jenkins | `backend/Dockerfile`, `backend/docker-compose.yml`, `Jenkinsfile` |
| 12–13 | Переключение production и отключение Node | на сервере — см. [DEPLOYMENT.md](DEPLOYMENT.md#переход-с-прежнего-nodejs-api) |

Node-скрипты заменены подкомандами бинарника: `setup-db` (было `npm run db:setup`), `seed` (`npm run seed`), `daily-report` (`scripts/dailyReport.js`).

## Аудит Node.js API

Код Node: около 13 тыс. строк, 74 файла, ~150 HTTP-маршрутов, 2 WebSocket, 2 фоновые задачи (автозакрытие тренировок старше 24 ч, отчёт в 08:00). Таблицы `nutrition_*` есть в БД, но API к ним не было — в Go не переносились.

## Совместимость ответов

Go сериализует строки БД так же, как `mysql2` (`internal/db/rows.go`), поэтому клиенты не заметили подмены:

| Тип | JSON |
|-----|------|
| `DECIMAL` | строка `"12.50"` |
| `DATETIME` / `TIMESTAMP` / `DATE` | ISO UTC `2026-11-03T09:00:00.000Z` — дата читается в часовом поясе процесса (`TZ`) |
| `TINYINT(1)` | число `0/1` |
| `JSON` | объект |

JWT выпускаются с теми же секретами и в том же формате — пользователей при переходе не разлогинило. Антифрод повторяет JS-семантику `Number()` и `new Date()` (`internal/gps/jsval.go`), эталоны в `gps_test.go` сняты с прежнего `validateWorkout()`.

Перед удалением Node ответы сравнивались скриптом паритета: одни и те же запросы в Node и Go — мобильный API, оба WebSocket, админка (чтение и запись). Результат **174/174**, в том числе Go без Node. Скрипт остался в истории git (`backend-go/scripts/parity.py`, коммит перед удалением Node). Единственные отличия — исправленные баги ниже и формат ответа 404 на несуществующий путь (Go отдаёт JSON вместо HTML-страницы Express).

## Баги Node, исправленные в Go

| Где было | Что не так в Node | Как в Go |
|----------|-------------------|----------|
| `orderService.js`, `createOrder` | `baseValues[11] = deliveryFee` перезаписывал способ доставки: заказы сохранялись с `delivery_method = "25"`/`"0"` и `delivery_fee = 0` (сумма верная) | способ и стоимость доставки сохраняются правильно |
| `reportsService.js`, `getReportsWorkouts` | `FROM workouts` без алиаса `w` — отчёт «Тренировки» всегда отвечал 500 | отчёт работает |
| `mobilePaymentAccountService.js`, `setMobilePaymentAccountStatus` | переключение статуса кошелька требовало номер и отвечало 400 | статус меняется без номера |
| `shopService.js`, `adminSaveProduct` | при редактировании без цветов размеры вставлялись дважды | один раз, остатки сохраняются |
| `setupDb.js` | миграция `025` (`USE runbonus`) переключала соединение — на базе с другим именем миграции 026+ уходили не туда | `USE`/`CREATE DATABASE` пропускаются, всё на одном соединении |

Старые заказы с `delivery_method = "25"`/`"0"` в БД остались как есть.

## Переменные окружения

Те же, что были у Node (`DB_*`, `JWT_*`, `SMS_*`, `TELEGRAM_*`, `FIREBASE_*`, `PORT`, `NODE_ENV`), плюс:

| Переменная | Назначение |
|------------|------------|
| `TZ` | часовой пояс процесса (как был у Node), в Docker по умолчанию `Asia/Dushanbe` |
| `JOBS` | `false` — отключить фоновые задачи (автозакрытие тренировок, отчёт в 08:00) |
| `UPLOADS_ROOT` | папка загрузок, по умолчанию `uploads` |

# Миграция backend: Node.js → Go

Миграция постепенная (паттерн «strangler»). Go-сервис (`backend-go/`) ставится **перед** Node.js:

```
клиент → nginx → Go :8080 ──(модуль включён)──→ ответ Go
                         └─(маршрут не перенесён / модуль выключен)──→ Node.js :3001
```

- Перенесённые маршруты обслуживает Go. Всё остальное проксируется в Node без изменений, включая WebSocket.
- Модули включаются переменной `GO_MODULES`, например `auth,shoes,workouts`. Выключенный модуль сразу уходит в Node, так что откат делается рестартом без пересборки.
- Обе версии работают с одной БД MariaDB/MySQL и одной папкой `uploads/`, схема не меняется.
- JWT выпускаются с теми же секретами и в том же формате (`{userId}`, 30 дней), поэтому пользователей не разлогинит.

## Статус этапов

| # | Этап | Статус | Где в Go |
|---|------|--------|----------|
| 1 | Аудит Node.js API и БД | ✅ | этот документ |
| 2 | Каркас: конфиг, БД, JWT, CORS, прокси в Node, статика `uploads` | ✅ | `internal/{config,db,httpx,auth,server}` |
| 3 | Auth и Users: SMS-вход, пароль, профиль, аватар, привязка устройства | ✅ модуль `auth` | `internal/users` |
| 4 | Shoes и QR: проверка QR, статус, активация при регистрации | ✅ модуль `shoes` | `internal/shoes` |
| 5 | Workouts и GPS: REST, WS `/app/workout`, Live GPS `/admin/live-tracking` | ✅ модуль `workouts` | `internal/workouts` |
| 6 | Anti-Fraud: фильтр точек, валидация трека, скорость > 60 км/ч | ✅ | `internal/gps` |
| 7 | Progress: `/api/me`, прогресс по км, рейтинг | ✅ модуль `progress` | `internal/rewards` |
| 8 | Награды и задания: контрольные точки, выбор награды, челленджи | ✅ модули `rewards`, `challenges` | `internal/rewards`, `internal/challenges` |
| 9 | Shop и Orders: каталог, оплата/доставка, чек, заказы, реклама | ✅ модули `shop`, `ads` | `internal/shop`, `internal/ads` |
| 10 | Firebase (FCM HTTP v1) и Telegram | ✅ модуль `push` | `internal/notify` |
| 11 | Docker + Jenkins | ✅ | `backend-go/Dockerfile`, `docker-compose.yml`, `Jenkinsfile` |
| 12 | Переключение production на Go | ⏳ ниже — делается на сервере | |
| 13 | Отключение Node.js | ⏳ после переноса админки | |

**Ещё в Node:**
- админка `/api/admin/**`, около 95 маршрутов: пользователи, кроссовки, склад, заказы, курьеры, отчёты, реклама, награды;
- утренний Telegram-отчёт — он строится по админским отчётам.

Это следующая волна. Пока её нет, Go прозрачно проксирует эти запросы в Node.

## Аудит Node.js API

Код: около 13 тыс. строк, 74 файла, Express 4, mysql2, ws, firebase-admin, bcryptjs, jsonwebtoken.

| Группа | Префикс | Маршрутов |
|--------|---------|-----------|
| Auth, профиль, legacy-кошелёк | `/api/auth`, `/api/me`, `/api/user`, `/api/bonus` | 15 |
| Кроссовки, QR | `/api/shoes`, `/api/mobile/shoes/*` | 3 |
| Тренировки, GPS | `/api/workouts`, WS `/app/workout`, WS `/admin/live-tracking` | 13 + 2 WS |
| Прогресс, награды, задания, рейтинг | `/api/rewards`, `/api/challenges`, `/api/leaderboard` | 11 |
| Магазин, заказы, реклама, push | `/api/mobile/*` | 17 |
| Админка | `/api/admin/**` | ~95 |

Фоновые задачи:
- автозакрытие тренировок старше 24 ч — в Go за флагом `GO_JOBS`;
- утренний Telegram-отчёт — пока в Node.

Таблицы БД по доменам:

- **users** — `users`, `user_active_shoes`, `user_subscriptions`, `sms_verification_codes`, `user_push_tokens`, `admin_users`;
- **shoes** — `shoes`, `shoe_batches`, `user_shoe_progress`;
- **workouts** — `workouts`, `workout_points`;
- **награды** — `rewards`, `reward_milestones`, `milestone_rewards`, `user_rewards`, `reward_stock`, `reward_promo_codes`, `reward_delivery`;
- **задания** — `challenge_levels`, `challenge_level_rewards`, `user_challenges`, `user_challenge_rewards`;
- **магазин** — `products`, `product_*`, `shop_categories`, `shop_orders`, `payment_methods`, `delivery_methods`, `mobile_payment_accounts`, `couriers`, `stock_movements`;
- **реклама** — `ad_*`, `advertisers`;
- **legacy** — `accounts`, `bonuses`, `user_bonus_*`, `withdrawal_*`, `bonus_settings*`;
- **nutrition** — `nutrition_*`, API к ним нет.

### Совместимость ответов

Go сериализует строки БД так же, как `mysql2` (`internal/db/rows.go`):

| Тип | JSON |
|-----|------|
| `DECIMAL` | строка `"12.50"` |
| `DATETIME` / `TIMESTAMP` / `DATE` | ISO UTC `2026-11-03T09:00:00.000Z` — дата читается в часовом поясе процесса, поэтому `TZ` контейнера должен совпадать с Node |
| `TINYINT(1)` | число `0/1` |
| `JSON` | объект |

Антифрод повторяет JS-семантику `Number()` и `new Date()` (`internal/gps/jsval.go`). Эталоны в `gps_test.go` сняты с `validateWorkout()` Node.

### Найденный баг Node (в Go исправлен)

`backend/src/services/orderService.js`, `createOrder`: `baseValues[11] = deliveryFee` перезаписывает **способ доставки** стоимостью. Из-за этого каждый заказ сохраняется с `delivery_method = "25"` (или `"0"`) и `delivery_fee = 0`. Итоговая сумма при этом верная. Правильный индекс — `12`. Go сохраняет правильно, поэтому после включения модуля `shop` новые заказы в админке будут показывать нормальный способ доставки.

## Проверка паритета

`backend-go/scripts/parity.py` шлёт одни и те же запросы в Node и в Go и сравнивает статус и JSON. Изменчивые поля (id, токены, время) не сравниваются, осознанные отличия помечаются как «известное».

```bash
# оба сервиса смотрят в одну ТЕСТОВУЮ базу (SMS_DEV_CODE=123456)
cd backend && node src/index.js                                   # :3001
cd backend-go && NODE_UPSTREAM=http://127.0.0.1:3001 go run ./cmd/api   # :8080
python3 scripts/parity.py          # чтение и авторизация
python3 scripts/parity.py --full   # + регистрация, тренировки, WS, награды, заказы (пишет в БД!)
```

Последний прогон: **88/88**, и со всеми модулями в Go, и с `GO_MODULES=auth` (остальное через прокси).

## Запуск локально

```bash
cd backend-go
go run ./cmd/api        # читает ../backend/.env; порт GO_PORT (8080)
go test ./...
```

| Переменная | Назначение |
|------------|------------|
| `GO_PORT` | порт Go API (8080) |
| `NODE_UPSTREAM` | адрес Node для непереносённых маршрутов (`http://127.0.0.1:3001`); пусто — 404 |
| `GO_MODULES` | `all` или список: `auth,shoes,workouts,progress,rewards,challenges,shop,ads,push` |
| `GO_JOBS` | `true` — автозакрытие тренировок в Go (выключите эту задачу в Node, чтобы не дублировать) |
| `BACKEND_DIR` | каталог Node-бэкенда (`.env`, `secrets/`), по умолчанию `../backend` |
| `UPLOADS_ROOT` | общая с Node папка загрузок |
| `TZ` | часовой пояс, как у Node-процесса |

Остальные переменные (`DB_*`, `JWT_*`, `SMS_*`, `TELEGRAM_*`, `FIREBASE_*`) — те же, что у Node.

## 12. Переключение production

1. На сервере: `cd backend-go && docker compose up -d --build`, либо Jenkins с `DEPLOY=true`. Go поднимется на `:8080` рядом с Node (PM2, `:3001`). Начните с `GO_MODULES=none` — всё уйдёт в Node.
2. В nginx переключите `/api/`, `/app/workout`, `/admin/live-tracking`, `/uploads/` на Go:

   ```nginx
   location ~ ^/(api|uploads|app/workout|admin/live-tracking) {
       proxy_pass http://127.0.0.1:8080;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection $connection_upgrade;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_read_timeout 3600s;
   }
   ```

   В блок `http` добавьте `map $http_upgrade $connection_upgrade { default upgrade; '' close; }`.
3. Включайте модули по одному, следя за логами (`docker compose logs -f api-go`) и приложением:
   - сначала `auth,shoes`;
   - затем добавить `progress,rewards,challenges`;
   - затем `workouts` — в спокойное время, когда нет активных тренировок: WebSocket переподключится к Go;
   - в конце `shop,ads,push`.
4. Когда `workouts` стабилен: `GO_JOBS=true` в Go и уберите `setInterval(autoCloseStaleWorkouts)` из Node.

Откат: убрать модуль из `GO_MODULES` и перезапустить контейнер или вернуть `proxy_pass` на `:3001`.

## 13. Отключение Node.js

После переноса админки (`/api/admin/**`) и утреннего отчёта, когда в логах Go больше нет строк `[proxy]`:

1. Несколько дней наблюдать production на Go.
2. `pm2 stop runbonus-api`, убрать `NODE_UPSTREAM`.
3. Удалить `backend/` из репозитория, перенести `.env` и `secrets/` в `backend-go/` (`BACKEND_DIR=.`).

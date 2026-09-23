# База данных

СУБД: **MySQL 8**, кодировка `utf8mb4_unicode_ci`.

## Инициализация

```bash
cd backend
npm run db:setup    # schema.sql + все миграции
npm run seed        # тестовые данные
```

Или одной командой: `npm run db:init`.

## Структура файлов

```
database/
├── schema.sql              Базовая схема
├── setup-local.sql         Создание БД и пользователя
└── migrations/             Инкрементальные миграции (001–040)
```

`backend/src/setupDb.js` применяет `schema.sql`, затем все файлы из `migrations/` по порядку.

## Основные таблицы

| Таблица | Назначение |
|---------|------------|
| `users` | Клиенты (+ `total_distance_km`) |
| `admin_users` | Администраторы |
| `shoes` | Кроссовки с QR |
| `user_active_shoes` | Активная пара клиента |
| `workouts` | Тренировки (статус, подтверждённая дистанция) |
| `workout_points` | GPS-точки маршрута |
| `reward_milestones` | Контрольные точки (50/100/200/300/500 км) |
| `rewards` | Каталог подарков/скидок |
| `milestone_rewards` | Связь milestone ↔ награды |
| `reward_stock` | Склад по размеру/цвету |
| `user_rewards` | Выбранные награды пользователя |
| `reward_delivery` | Доставка физических подарков |
| `reward_promo_codes` | Промокоды скидок |
| `user_bonus_wallets` | **Deprecated** — архив старого кошелька |
| `user_bonus_transactions` | **Deprecated** — архив операций |
| `accounts` | Счета компании (магазин/реклама; bonus_fund deprecated) |
| `bonus_settings` | Лимиты тренировок (`price_per_km = 0`) |
| `customer_levels` | Уровни по километражу |
| `withdrawal_requests` | Legacy: заявки на вывод (модуль отключён) |
| `products`, `orders` | Магазин |
| `warehouse_stock` | Склад |
| `ad_campaigns` | Реклама |
| `user_activity_goals` | Цели активности (кольца) |
| `sms_verification_codes` | OTP-коды |
| `push_tokens` | FCM-токены |

## Статусы тренировки

| Статус | Описание |
|--------|----------|
| `in_progress` | Активная |
| `approved` | Одобрена, км добавлены к прогрессу |
| `rejected` | Отклонена (правила) |
| `suspicious` | Подозрительная |
| `rejected_no_fund` | Нет средств на фонде |

## Миграции

Новая миграция: `database/migrations/027_описание.sql`

После добавления файла:

```bash
cd backend && npm run db:setup
```

Миграции идемпотентны (`IF NOT EXISTS`, проверки колонок).

## Резервное копирование

```bash
mysqldump -u runbonus -p runbonus > backup_$(date +%Y%m%d).sql
```

Восстановление:

```bash
mysql -u runbonus -p runbonus < backup_20260616.sql
```

## Полезные запросы

Активные тренировки:

```sql
SELECT w.id, u.name, u.phone, w.started_at, w.distance_km
FROM workouts w
JOIN users u ON u.id = w.user_id
WHERE w.status = 'in_progress';
```

GPS-точки тренировки:

```sql
SELECT latitude, longitude, recorded_at
FROM workout_points
WHERE workout_id = 42
ORDER BY recorded_at;
```

Баланс фонда:

```sql
SELECT name, current_balance FROM accounts WHERE type = 'bonus_fund';
```

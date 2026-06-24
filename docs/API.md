# REST API

Базовый URL: `http://localhost:3001` (dev) или `https://runbonus.online` (prod).

## Авторизация

### Пользователь

```http
Authorization: Bearer <user_jwt>
X-Device-Id: <uuid устройства>
```

### Администратор

```http
Authorization: Bearer <admin_jwt>
```

---

## Health

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/health` | Статус API |

---

## Auth (`/api/auth`)

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | `/sms/status` | — | Статус SMS-провайдера |
| POST | `/sms/send` | — | Отправить OTP (`phone`, `purpose`) |
| POST | `/sms/register` | — | Регистрация по SMS |
| POST | `/sms/login` | — | Вход по SMS |
| GET | `/me` | User | Профиль |
| PATCH | `/profile` | User | Обновить профиль |
| POST | `/logout` | User | Выход |

---

## Workouts (`/api/workouts`)

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | `/active` | User | Активная тренировка |
| POST | `/start` | User | Начать тренировку |
| POST | `/:id/points` | User | Отправить GPS-точки (batch) |
| POST | `/:id/finish` | User | Завершить тренировку |
| GET | `/history` | User | История тренировок |
| GET | `/:id/points` | User | Точки маршрута |

### Finish — тело запроса

```json
{
  "points": [{ "latitude": 38.56, "longitude": 68.78, "speed": 8.5, "accuracy": 12, "recorded_at": "..." }],
  "distance_km": 2.5,
  "duration_seconds": 1200,
  "moving_seconds": 1100,
  "pause_seconds": 100,
  "steps_count": 2500,
  "max_speed": 12.5,
  "avg_speed": 7.2
}
```

---

## User (`/api/user`)

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | `/summary` | User | Сводка: кольца активности, цели, статистика |

---

## Shoes (`/api/shoes`)

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| POST | `/activate` | User | Активировать QR кроссовок |

---

## Bonus (`/api/bonus`)

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | `/balance` | User | Баланс бонусов |
| GET | `/history` | User | История операций |

---

## Withdrawal (`/api/withdrawal`)

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | `/methods` | User | Способы вывода |
| GET | `/wallet-summary` | User | Сводка кошелька |
| GET | `/my-requests` | User | Мои заявки |
| POST | `/requests` | User | Создать заявку на вывод |

---

## Mobile / Shop (`/api/mobile`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/shop-catalog` | Каталог |
| GET | `/products/:id` | Товар |
| POST | `/orders` | Оформить заказ |
| GET | `/my-orders` | Мои заказы |
| GET | `/ads/banners` | Рекламные баннеры |
| POST | `/push/register` | Регистрация FCM-токена |

---

## Admin (`/api/admin`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/login` | Вход админа |
| GET | `/users` | Список клиентов |
| GET | `/users/:id` | Карточка клиента |
| GET | `/workouts` | Все тренировки |
| GET | `/workouts/live` | **Live GPS** активных тренировок |
| GET | `/workouts/:id` | Детали + GPS-точки |
| GET | `/shoes` | Кроссовки |
| POST | `/shoes/generate` | Генерация QR-партии |
| POST | `/bonus/topup` | Пополнение кошелька клиента |
| POST | `/users/block` | Блокировка |
| POST | `/users/reset-device` | Сброс привязки устройства |

### Live GPS — ответ

```json
{
  "workouts": [
    {
      "workout_id": 42,
      "client_name": "Иван",
      "phone": "+992...",
      "distance_km": 1.25,
      "elapsed_seconds": 600,
      "points_count": 45,
      "last_position": { "lat": 38.56, "lng": 68.78 },
      "points": [{ "lat": 38.56, "lng": 68.78, "recorded_at": "..." }]
    }
  ],
  "updated_at": "2026-06-16T12:00:00.000Z"
}
```

### Вложенные admin-маршруты

| Префикс | Назначение |
|---------|------------|
| `/api/admin/accounts` | Бонусные счета компании |
| `/api/admin/bonus-settings` | Настройки бонусов |
| `/api/admin/customer-levels` | Уровни клиентов |
| `/api/admin/shop` | Магазин, заказы, склад |
| `/api/admin/withdrawals` | Заявки на вывод |
| `/api/admin/reports` | Отчёты |
| `/api/admin/ads` | Реклама |

---

## Коды ошибок (примеры)

| Код / поле | Значение |
|------------|----------|
| `DEVICE_MISMATCH` | Вход с другого устройства |
| `DEVICE_REQUIRED` | Нет заголовка X-Device-Id |
| `WORKOUT_NOT_ACTIVE` | Тренировка уже завершена |
| HTTP 401 | Невалидный или просроченный токен |

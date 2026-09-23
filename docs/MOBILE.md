# Мобильное приложение

Стек: **Ionic React 8** + **Vite** + **Capacitor 6**.

## Экраны (после миграции на награды)

| Путь | Экран |
|------|-------|
| `/` | Главная — прогресс км, следующая награда, CTA тренировки |
| `/workouts` | История тренировок |
| `/rewards` | Контрольные точки (50/100/200/300/500 км) |
| `/my-rewards` | Мои выбранные награды и статусы |
| `/workout` | Активная тренировка (карта, метрики, пауза) |
| `/shop` | Магазин (покупка за деньги) |
| `/cart` | Корзина |
| `/orders` | Мои заказы |
| `/profile` | Профиль, кроссовки, настройки |
| `/activate` | Активация QR кроссовок |

Нижняя навигация: **Главная · Тренировки · Награды · Профиль**.

Редиректы legacy: `/summary` → `/`, `/wallet` → `/rewards`, `/history` → `/workouts`, `/progress` → `/rewards`.

## Бизнес-логика

1. Активировать кроссовки по QR  
2. Тренировка → GPS на backend → anti-fraud → **подтверждённые км**  
3. Milestone открывает награду  
4. Пользователь выбирает один подарок (размер / цвет / промокод)  
5. Магазин отдельно — оплата деньгами, не бонусами  

Подробнее: [REWARDS_MIGRATION.md](REWARDS_MIGRATION.md), [API.md](API.md).

## Переменные окружения

| Файл | Назначение |
|------|------------|
| `.env` | Dev (локальный API) |
| `.env.production` | Production build |

```env
VITE_API_URL=http://192.168.1.100:3001
```

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Dev-сервер (браузер) |
| `npm run build` | Production web build |
| `npm run build:release` | Build + `cap sync` (Android) |
| `npm run build:ios` | Build + sync iOS + patch plugins |
| `npm run cap:open` | Открыть Android Studio |
| `npm run cap:open:ios` | Открыть Xcode |
| `npm run sms-hash` | Хеш для Android SMS Retriever |

## Ключевые сервисы

### `workoutTracker.js`

Управление сессией тренировки:

- Старт/пауза/стоп
- GPS через `geolocation.js`
- Шагомер (нативный плагин)
- Автопауза при остановке (< 0.5 м/с, 4 сек)
- Синхронизация точек на сервер каждые 4 сек
- iOS Live Activity

### `rewards.js`

Клиент API наград: progress, milestones, select, my.

### `gpsFilter.js`

Фильтрация GPS-шума:

- Погрешность ≤ 15 м (первая точка до 80 м)
- Мин. смещение 2.5 м
- Интервал 1–15 сек между точками
- Скользящее среднее скорости (3 точки)
- Haversine для дистанции

Подробнее: [WORKOUTS.md](WORKOUTS.md).

## Нативные плагины

### Android

- `WorkoutForegroundService` — уведомление во время тренировки
- `WorkoutTrackingPlugin` — шаги, daily steps
- `SmsOtpRetriever` — автоподстановка SMS-кода
- Разрешения в `AndroidManifest.xml`: location, foreground service, activity recognition

### iOS

- `WorkoutTrackingPlugin` — шаги

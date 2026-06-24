# Мобильное приложение

Стек: **Ionic React 8** + **Vite** + **Capacitor 6**.

## Экраны

| Путь | Экран |
|------|-------|
| `/` | Главная — баланс, CTA тренировки, статистика |
| `/summary` | Сводка — кольца, недельный график, уровень |
| `/workout` | Активная тренировка (карта, метрики, пауза) |
| `/workouts` | История тренировок |
| `/wallet` | Кошелёк бонусов |
| `/wallet/withdraw` | Вывод средств |
| `/shop` | Магазин |
| `/cart` | Корзина |
| `/profile` | Профиль и настройки |
| `/activate` | Активация QR кроссовок |

Нижняя навигация: Главная · Сводка · Кошелёк · Магазин · Профиль.

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
- `WorkoutLiveActivity` — Dynamic Island / Live Activity
- `AppBridgeViewController` — регистрация локальных плагинов
- После `cap sync`: `node scripts/ios-patch-cap-config.mjs`

## Сборка Android

```bash
cd mobile
npm run build:release
npx cap open android
```

В Android Studio: выберите устройство → Run.

APK: **Build → Build APK(s)**.

## Сборка iOS

Только на Mac. См. [deploy/IOS.md](../deploy/IOS.md).

```bash
npm run build:ios
cd ios/App && pod install
npx cap open ios
```

В Xcode выберите схему **App** (не extension).

## Отладка

| Проблема | Решение |
|----------|---------|
| API недоступен | `VITE_API_URL` = IP ПК, firewall, backend на `0.0.0.0` |
| GPS не фиксируется | Разрешения, тест на улице, см. WORKOUTS.md |
| Live Activity не видна | Плагин зарегистрирован, foreground 2–3 сек до сворачивания |
| SMS OTP | `SMS_DEV_CODE` в backend `.env` или настройка OsonSMS |

Chrome DevTools для WebView: `chrome://inspect` (Android).

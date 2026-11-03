# Мобильное приложение

Стек: **Flutter 3.47 / Dart 3.13** (`mobile/`), Android + iOS. Bundle ID / applicationId — `com.runbonus.app`.

## Экраны

| Путь | Экран |
|------|-------|
| `/login` | Вход по телефону + SMS-код |
| `/` | Главная — прогресс км, следующая награда, кнопка тренировки |
| `/workout` | Активная тренировка (карта, метрики, пауза, удержание для финиша) |
| `/workouts` | История тренировок |
| `/rewards`, `/challenges` | Челленджи / контрольные точки |
| `/milestones?milestone=ID` | Прогресс и выбор награды |
| `/my-rewards` | Мои выбранные награды и статусы |
| `/leaderboard` | Рейтинг |
| `/shop`, `/shop/:id` | Магазин и карточка товара (покупка за деньги) |
| `/cart` | Корзина и оформление заказа (в т.ч. мобильный перевод с чеком) |
| `/orders` | Мои заказы |
| `/profile` | Профиль, кроссовки, единицы измерения, выход |

Редиректы legacy: `/summary` → `/`, `/wallet` → `/rewards`, `/history` → `/workouts`, `/progress` → `/rewards`.

## Структура `lib/`

```
lib/
├── main.dart            Запуск, тема, офлайн-оверлей
├── router.dart          go_router: авторизация, редиректы
├── app_state.dart       Пользователь, вход/выход, bootstrap
├── core/                API-клиент, хранилище, форматирование, телефон, конфиг
├── services/            Награды, челленджи, магазин, корзина, реклама, push
├── workout/             GPS, фильтр, буфер точек, WebSocket, трекер, нативный канал
└── ui/                  Тема, страницы, общие виджеты
```

## Адрес API

По умолчанию (debug и release) — Go API: `https://runbonus.online` (`/api/*`, WebSocket `/app/workout`).

Локальный backend на эмуляторе / в LAN:

```bash
flutter run --dart-define=API_URL=http://10.0.2.2:3000          # Android emulator
flutter run --dart-define=API_URL=http://localhost:3000         # iOS simulator
flutter run --dart-define=API_URL=http://192.168.1.100:3000     # телефон в Wi‑Fi
```

AdMob unit ID можно передать так же: `--dart-define=ADMOB_GOOGLE_HOME=...` (`ADMOB_GOOGLE_WORKOUT`, `ADMOB_GOOGLE_SHOP`, `ADMOB_PLAY_*`), `ADMOB_TEST=true`, `ADMOB_ENABLED=false`.

## Команды

| Команда | Описание |
|---------|----------|
| `flutter pub get` | Установить зависимости |
| `flutter run` | Запуск на устройстве / эмуляторе |
| `flutter analyze` | Статический анализ |
| `flutter build appbundle` | Android App Bundle для Google Play |
| `flutter build apk --release` | APK |
| `flutter build ipa` | iOS-архив (только Mac, см. [deploy/IOS.md](../deploy/IOS.md)) |
| `dart run flutter_launcher_icons` | Пересоздать иконки из `assets/icon.png` |

## Бизнес-логика

1. Активировать кроссовки по QR
2. Тренировка → GPS на backend → anti-fraud → **подтверждённые км**
3. Milestone открывает награду
4. Пользователь выбирает один подарок (размер / цвет / промокод)
5. Магазин отдельно — оплата деньгами, не бонусами

Подробнее: [REWARDS_MIGRATION.md](REWARDS_MIGRATION.md), [API.md](API.md).

## Тренировка (`lib/workout/`)

- `workout_tracker.dart` — сессия: старт/пауза/стоп, автопауза, синхронизация точек каждые 4 с (на паузе — 8 с), восстановление после перезапуска.
- `geolocation.dart` — поток GPS через `geolocator`; на Android — foreground-сервис с уведомлением, на iOS — фоновая геолокация.
- `gps_filter.dart` — фильтрация шума (точность, мин. смещение, интервал, сглаживание скорости, Haversine).
- `gps_buffer.dart` — офлайн-буфер точек.
- `workout_socket.dart` — WebSocket live-трекинга с подтверждениями.
- `native_workout.dart` — канал `runbonus/workout` (шаги, Live Activity, сворачивание).

Подробнее: [WORKOUTS.md](WORKOUTS.md).

## Карта

- **iOS** — нативный MapKit (platform view `runbonus/apple_map`, `ios/Runner/AppleMapView.swift`).
- **Android** — OpenStreetMap через `flutter_map` (тёмная подложка Esri, при ошибках — стандартные тайлы OSM).

## Нативная часть

### Android (`android/app/src/main/kotlin/com/runbonus/app/`)

- `MainActivity.kt`:
  - канал `runbonus/workout` — шаги (`TYPE_STEP_COUNTER`) и сворачивание приложения;
  - `runbonus/sms_otp` — автоподстановка кода через SMS Retriever;
  - канал уведомлений `runbonus_default`;
  - системное «назад» на корневом экране сворачивает приложение.
- `AppSignatureHelper.kt` — хеш для SMS Retriever. Выводится в logcat (`SMS_APP_HASH=...`), его нужно добавить в backend `.env`.
- `google-services.json` — Firebase (push).

### iOS (`ios/`)

- `Runner/RunBonusNativePlugin.swift` — шаги (CMPedometer) и Live Activity.
- `Runner/WorkoutLiveActivityManager.swift`, `Runner/WorkoutActivityAttributes.swift` — управление Live Activity.
- `WorkoutLiveActivity/` — target `WorkoutLiveActivityExtension` (виджет Dynamic Island / экрана блокировки, iOS 16.2+).
- Push на iOS требует `GoogleService-Info.plist` и capability Push Notifications. Без них приложение работает, просто не регистрирует push-токен.

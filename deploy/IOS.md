# RunBonus — сборка для iOS

Сборка и публикация в App Store возможны **только на Mac** с Xcode.

## Требования (Mac)

- macOS 14+
- [Xcode](https://developer.apple.com/xcode/) 16+ (из App Store)
- Xcode Command Line Tools: `xcode-select --install`
- Flutter: `brew install --cask flutter` (проверка — `flutter doctor`)

Зависимости плагинов подтягиваются через Swift Package Manager автоматически при первой сборке.

## Запуск

```bash
cd mobile
flutter pub get
flutter run            # выбранный симулятор или подключённый iPhone
```

Для работы с локальным backend на реальном iPhone:

```bash
flutter run --dart-define=API_URL=http://192.168.x.x:3000
```

(замените на IP вашего Mac в той же Wi‑Fi сети). В release-сборке API всегда `https://runbonus.online`.

## Подпись и публикация

1. `open ios/Runner.xcworkspace`
2. В **Signing & Capabilities** проверьте Team (`D7D288U3N8`) для обоих target: **Runner** и **WorkoutLiveActivityExtension**.
3. Соберите архив: `flutter build ipa` → `build/ios/ipa/`. Загрузите его через Transporter или **Xcode → Organizer**.

## Target'ы

| Target | Bundle ID | Назначение |
|--------|-----------|------------|
| Runner | `com.runbonus.app` | Приложение (iOS 15.6+) |
| WorkoutLiveActivityExtension | `com.runbonus.app.WorkoutLiveActivityExtension` | Live Activity / Dynamic Island (iOS 16.2+) |

## Разрешения (уже в Info.plist)

| Ключ | Назначение |
|------|------------|
| Геолокация (When In Use / Always) | Тренировки, GPS-маршрут |
| Motion | Шаги во время тренировки |
| Камера, фото | Аватар, чек оплаты |
| Фон — location | Тренировка при свёрнутом приложении |
| Live Activities | Метрики на экране блокировки |
| ATS | HTTP-исключения для `runbonus.online`, IP сервера, `localhost` |
| GADApplicationIdentifier | Google AdMob (сейчас тестовый ID — замените на свой) |

## Push-уведомления

Для push на iOS:

1. Скачайте `GoogleService-Info.plist` из Firebase Console и добавьте его в `ios/Runner` (target Runner).
2. Включите capability **Push Notifications**.
3. Загрузите APNs-ключ в Firebase.

Без этих шагов приложение работает, просто не регистрирует push-токен.

## Частые проблемы

**Signing error** — в Xcode выберите Apple ID / Team для обоих target'ов.

**Нет сети на iPhone** — в релизе API `https://runbonus.online`; проверьте, что сайт открывается в Safari.

**Симулятор не видит API** — по умолчанию приложение использует `https://runbonus.online`. Локальный backend: `--dart-define=API_URL=http://localhost:3000`.

**Live Activity не появляется** — нужен iOS 16.2+ и включённые «Live Activities» в настройках приложения. Активность создаётся только когда приложение на экране.

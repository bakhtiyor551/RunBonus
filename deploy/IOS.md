# RunBonus — сборка для iOS

Сборка и публикация в App Store возможны **только на Mac** с установленными Xcode и CocoaPods.

## Требования (Mac)

- macOS 13+
- [Xcode](https://developer.apple.com/xcode/) 15+ (из App Store)
- Xcode Command Line Tools: `xcode-select --install`
- [CocoaPods](https://cocoapods.org/): `sudo gem install cocoapods`
- Node.js 18+

## Подготовка проекта (Windows или Mac)

```bash
cd mobile
npm install
npm run build:ios
```

Команда собирает веб-приложение и копирует его в `mobile/ios/App/App/public`.

## Сборка на Mac

```bash
cd mobile/ios/App
pod install
cd ../..
npx cap open ios
```

В Xcode:

1. Выберите команду **App** → цель **App**.
2. Вкладка **Signing & Capabilities** — укажите свою **Team** (Apple Developer).
3. Устройство: симулятор или подключённый iPhone.
4. **Product → Run** (▶) — запуск на устройстве/симуляторе.
5. **Product → Archive** — сборка для TestFlight / App Store.

## API (продакшен)

В `mobile/.env.production`:

```
VITE_API_URL=https://runbonus.online
```

На **реальном iPhone** для разработки с локальным backend укажите в `.env`:

```
VITE_API_URL=http://192.168.x.x:3001
```

(замените на IP вашего Mac/ПК в одной Wi‑Fi сети).

## Разрешения (уже в Info.plist)

| Ключ | Назначение |
|------|------------|
| Геолокация | Тренировки, GPS-маршрут |
| Камера | Сканирование QR кроссовок |
| Фон — location | Тренировка при свёрнутом приложении |
| ATS | HTTP/HTTPS к API (продакшен: **https://runbonus.online**) |

## Частые проблемы

**`pod install` не найден** — установите CocoaPods на Mac.

**Signing error** — в Xcode выберите Apple ID в Signing & Capabilities.

**Нет сети на iPhone** — в релизе API: `https://runbonus.online`. Проверьте интернет и что сайт открывается в Safari.

**Ошибка HTML вместо JSON** — пересоберите: `npm run build:ios` (в `.env.production` только `https://runbonus.online`, без второй строки `VITE_API_URL`).

**Симулятор не видит localhost API** — backend должен работать на Mac; для API используется `http://localhost:3001` только в симуляторе.

## Bundle ID

`com.runbonus.app` — тот же, что и Android.

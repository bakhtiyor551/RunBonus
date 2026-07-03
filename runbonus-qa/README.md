# RunBonus QA — Appium + WebDriverIO

Автоматизированное E2E-тестирование мобильного приложения RunBonus на Android.

## Стек

- Appium 2.x + UiAutomator2
- WebDriverIO 9 + TypeScript
- Allure Report + HTML + JSON

## Структура

```
runbonus-qa/
├── tests/          # auth, profile, shop, gps, running, offline, bonus, withdraw, push, fraud, shoes
├── pages/          # Page Object Model
├── helpers/        # gpsHelper, adbHelper, apiHelper, webviewHelper
├── reporters/      # JSON/HTML отчёт RunBonus
├── data/routes/    # GPS маршруты
├── reports/        # allure, json, html
└── screenshots/    # при ошибках
```

## Установка

```bash
cd runbonus-qa
npm install
npm install -g appium
appium driver install uiautomator2
```

Скопируйте `.env.example` → `.env` и заполните `TEST_USER_PHONE`, `TEST_SMS_CODE`.

Соберите APK:
```bash
cd ../mobile
npm run build:release
# APK: mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Запустите эмулятор Android и проверьте ADB:
```bash
adb devices
```

## Запуск

| Команда | Описание |
|---------|----------|
| `npm test` | Все тесты |
| `npm run test:release` | Перед релизом (auth, gps, running, offline, bonus, fraud) |
| `npm run test:nightly` | Полный ночной прогон |
| `npm run test:auth` | Только авторизация |
| `npm run test:gps` | GPS |
| `npm run report:allure` | Allure отчёт |

## GPS через ADB

```bash
adb emu geo fix 68.7870 38.5598
```

Маршруты 1/5/10 км проигрываются через `helpers/gpsHelper.ts`.

## Offline

```bash
adb shell svc wifi disable
adb shell svc data disable
```

## Отчёты

- `reports/report-latest.txt` — текстовый отчёт
- `reports/json/report-latest.json` — JSON
- `reports/html/index.html` — HTML
- `reports/allure-results/` — Allure

## Критерии приёмки (ТЗ)

- ≥ 90% сценариев покрыто
- GPS и Offline автоматизированы
- Отчёты и скриншоты при ошибках — автоматически
- Успешность ≥ 95% для релиза

## Примечания

- Capacitor WebView: тесты переключаются в `WEBVIEW` контекст
- Push-тесты проверяют UI-каналы; полная проверка FCM требует реального устройства
- Для CI: поднимите эмулятор + Appium server перед `npm test`

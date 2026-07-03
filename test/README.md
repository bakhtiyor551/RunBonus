# RunBonus QA Bot

Автоматизированная система тестирования GPS-трекинга, бега, оффлайн-режима, антифрода и бонусов.

## Архитектура

```
test/
├── src/
│   ├── index.js           # Главный runner
│   ├── bots/
│   │   ├── authBot.js     # Auth Bot
│   │   ├── apiBot.js      # API Bot
│   │   ├── gpsBot.js      # GPS Bot (GPS-001..004)
│   │   ├── runningBot.js  # Running Bot (RUN-001..005)
│   │   ├── offlineBot.js  # Offline Bot (OFFLINE-001..007)
│   │   ├── syncBot.js     # Sync Bot
│   │   ├── fraudBot.js    # Fraud Bot (FRAUD-001..004)
│   │   ├── bonusBot.js    # Bonus Bot (BONUS-001..003)
│   │   ├── screenshotBot.js
│   │   └── reportBot.js   # Report Bot
│   └── core/              # Общие утилиты
├── logs/                  # Логи GPS, sync, ошибок
├── screenshots/           # Артефакты при ошибках (JSON)
└── reports/               # Итоговые отчёты
```

## Быстрый старт

```bash
cd test
cp .env.example .env
# Заполните TEST_USER_PHONE, TEST_USER_PASSWORD
npm install
npm test
```

Получить JWT:
```bash
npm run auth:token
```

## Запуск сьютов

| Команда | Сьюты |
|---------|-------|
| `npm test` | Все |
| `npm run test:gps` | GPS-001..004 |
| `npm run test:running` | RUN-001..005 + пауза |
| `npm run test:offline` | OFFLINE-001..007 |
| `npm run test:sync` | SYNC-001..005 |
| `npm run test:fraud` | FRAUD-001..004 |
| `npm run test:bonus` | BONUS-001..003 |

## Критерии релиза

- GPS тесты = 100% PASS
- Offline тесты = 100% PASS
- Синхронизация = 100% PASS
- Критических ошибок = 0
- Общий процент ≥ 95%

## CI / быстрый режим

В `.env` установите `FAST_MODE=true` — интервалы GPS сокращаются до 100 мс.

## Примечания

- Бот тестирует **API + WebSocket** (как мобильное приложение), без UI-автоматизации.
- OFFLINE-003/004 (сворачивание, перезагрузка) симулируются через локальное хранилище.
- Скриншоты UI недоступны в CLI; при ошибках сохраняются JSON-артефакты в `screenshots/`.

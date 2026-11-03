# Документация RunBonus

Полное руководство по проекту лояльности RunBonus.

## Содержание

| Документ | Описание |
|----------|----------|
| [Быстрый старт](GETTING_STARTED.md) | Установка MySQL, backend, mobile, admin с нуля |
| [Архитектура](ARCHITECTURE.md) | Структура репозитория, потоки данных, технологии |
| [API](API.md) | REST API: эндпоинты, авторизация, примеры |
| [Миграция на награды](REWARDS_MIGRATION.md) | Удаление кошелька, milestones, чеклист |
| [Мобильное приложение](MOBILE.md) | Flutter, сборка Android/iOS, GPS |
| [Админ-панель](ADMIN.md) | Разделы админки, Live GPS, награды |
| [Тренировки и GPS](WORKOUTS.md) | Трекинг, фильтрация GPS, anti-fraud |
| [База данных](DATABASE.md) | Схема, миграции, основные таблицы |
| [Миграция на Go](GO_MIGRATION.md) | Аудит API, этапы, проверка паритета, переключение production |
| [Деплой](DEPLOYMENT.md) | Продакшен, iOS, DNS, переменные окружения |

## Кратко о проекте

**RunBonus** — программа лояльности для бегунов:

- Клиент активирует **QR-кроссовки** и бегает с GPS-трекингом.
- Backend подтверждает километры (anti-fraud).
- За контрольные точки (50/100/200/300/500 км) открываются **подарки и скидки**.
- **Магазин** — отдельные покупки за деньги.
- **Админ-панель** — клиенты, тренировки, склад наград, доставка, промокоды.

## Компоненты

```
RunBonus/
├── backend/     API (Go + MySQL)
├── mobile/      Клиентское приложение (Flutter)
├── admin/       Панель администратора (React + Vite)
├── database/    schema.sql и миграции
├── deploy/      Заметки по iOS и DNS
└── docs/        Эта документация
```

## Требования

- Go **1.27+** (API)
- MySQL **8**
- Node.js **18+** (только админ-панель)
- Flutter (мобильное приложение); для Android — Android Studio, для iOS — Mac и Xcode (см. [deploy/IOS.md](../deploy/IOS.md))

## Быстрые команды

```bash
# Backend (API на :3001)
cd backend && cp .env.example .env
go run ./cmd/api setup-db ../database && go run ./cmd/api seed
go run ./cmd/api

# Mobile
cd mobile && flutter run

# Admin
cd admin && npm install && npm run dev
```

Тестовый вход в админку после `seed`: **admin** / **admin123**.

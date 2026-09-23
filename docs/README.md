# Документация RunBonus

Полное руководство по проекту лояльности RunBonus.

## Содержание

| Документ | Описание |
|----------|----------|
| [Быстрый старт](GETTING_STARTED.md) | Установка MySQL, backend, mobile, admin с нуля |
| [Архитектура](ARCHITECTURE.md) | Структура репозитория, потоки данных, технологии |
| [API](API.md) | REST API: эндпоинты, авторизация, примеры |
| [Миграция на награды](REWARDS_MIGRATION.md) | Удаление кошелька, milestones, чеклист |
| [Мобильное приложение](MOBILE.md) | Ionic/Capacitor, сборка Android/iOS, GPS |
| [Админ-панель](ADMIN.md) | Разделы админки, Live GPS, награды |
| [Тренировки и GPS](WORKOUTS.md) | Трекинг, фильтрация GPS, anti-fraud |
| [База данных](DATABASE.md) | Схема, миграции, основные таблицы |
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
├── backend/     API (Node.js + Express + MySQL)
├── mobile/      Клиентское приложение (Ionic React + Capacitor)
├── admin/       Панель администратора (React + Vite)
├── database/    schema.sql и миграции
├── deploy/      Заметки по iOS и DNS
└── docs/        Эта документация
```

## Требования

- Node.js **18+**
- MySQL **8**
- Для Android: Android Studio, JDK 17
- Для iOS: Mac, Xcode 15+, CocoaPods (см. [deploy/IOS.md](../deploy/IOS.md))

## Быстрые команды

```bash
# Backend
cd backend && npm install && npm run db:init && npm run dev

# Mobile (браузер)
cd mobile && npm install && npm run dev

# Admin
cd admin && npm install && npm run dev
```

Тестовый вход в админку после `npm run seed`: **admin** / **admin123**.

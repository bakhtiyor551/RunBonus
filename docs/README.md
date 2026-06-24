# Документация RunBonus

Полное руководство по проекту «Бегай и получай бонусы».

## Содержание

| Документ | Описание |
|----------|----------|
| [Быстрый старт](GETTING_STARTED.md) | Установка MySQL, backend, mobile, admin с нуля |
| [Архитектура](ARCHITECTURE.md) | Структура репозитория, потоки данных, технологии |
| [API](API.md) | REST API: эндпоинты, авторизация, примеры |
| [Мобильное приложение](MOBILE.md) | Ionic/Capacitor, сборка Android/iOS, GPS, нативные плагины |
| [Админ-панель](ADMIN.md) | Разделы админки, Live GPS, управление клиентами |
| [Тренировки и GPS](WORKOUTS.md) | Трекинг, фильтрация GPS, бонусы, автопауза |
| [База данных](DATABASE.md) | Схема, миграции, основные таблицы |
| [Деплой](DEPLOYMENT.md) | Продакшен, iOS, DNS, переменные окружения |

## Кратко о проекте

**RunBonus** — платформа лояльности для бегунов:

- Клиент активирует **QR-кроссовки** и бегает с GPS-трекингом.
- За километраж начисляются **бонусы** (внутренняя валюта).
- Бонусы тратятся в **магазине** или выводятся по заявке.
- **Админ-панель** управляет клиентами, фондом, тренировками, складом и рекламой.

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

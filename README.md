# RunBonus — «Бегай и получай бонусы»

MVP платформы лояльности: мобильное приложение, REST API и админ-панель.  
**Docker не используется** — локальный MySQL.

## Документация

Полная документация в папке **[docs/](docs/README.md)**:

| Раздел | Ссылка |
|--------|--------|
| Быстрый старт | [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) |
| Архитектура | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| REST API | [docs/API.md](docs/API.md) |
| Мобильное приложение | [docs/MOBILE.md](docs/MOBILE.md) |
| Админ-панель | [docs/ADMIN.md](docs/ADMIN.md) |
| Тренировки и GPS | [docs/WORKOUTS.md](docs/WORKOUTS.md) |
| База данных | [docs/DATABASE.md](docs/DATABASE.md) |
| Деплой | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| iOS-сборка | [deploy/IOS.md](deploy/IOS.md) |

## Быстрый старт

```bash




## Структура проекта

```
RunBonus/
├── backend/       Node.js + Express + MySQL
├── mobile/        Ionic React + Capacitor (Android / iOS)
├── admin/         React админ-панель (Vite)
├── database/      schema.sql + migrations/
├── deploy/        iOS, DNS
└── docs/          Документация
```

## Основные возможности

- **Тренировки** — GPS-трекинг, шаги, автопауза, Live Activity (iOS)
- **Бонусы** — начисление за километраж, лимиты, бонусный фонд
- **Магазин** — товары за бонусы, заказы, склад
- **Админка** — клиенты, Live GPS, отчёты, реклама
- **Сводка** — кольца активности, цели, недельная статистика

## Правила бонусов (по умолчанию)

| Правило | Значение |
|---------|----------|
| За 1 км | 3 сомони |
| Дневной лимит | 10 сомони |
| Лимит на пару | 200 сомони |
| Мин. дистанция | 500 м |
| Мин. время | 5 минут |

## Требования

- [Node.js](https://nodejs.org/) 18+
- [MySQL](https://dev.mysql.com/downloads/) 8
- Android Studio + JDK 17 (для APK)
- Mac + Xcode (для iOS)

## Тестовые данные (после seed)


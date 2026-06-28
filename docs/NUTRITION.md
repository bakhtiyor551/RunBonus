# Модуль «AI Питание и Калории» (RunBonus+)

Версия: 1.0  
Доступ: только RunBonus+ (активная подписка)

## Назначение

Premium-раздел для контроля питания с AI-распознаванием еды, синхронизацией с тренировками и рекомендациями.

## Возможности

| Функция | Описание |
|---------|----------|
| Дневной баланс | Сожжено / съедено / цель / остаток |
| AI-фото | Распознавание блюда, БЖУ, уверенность |
| Добавление еды | Фото, поиск, вручную, избранное |
| История | Записи по времени за день |
| Графики | Неделя: потребление vs расход |
| Аналитика | Средние за 30 дней |
| Рекомендации | Превышение нормы, белок, пробежка |
| Streak | 7 дней подряд → push + бонусы (планируется) |
| Premium gate | Paywall без подписки |

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/nutrition/status` | Статус подписки |
| GET | `/api/nutrition/today` | Дневная статистика |
| GET | `/api/nutrition/day` | Alias today |
| GET | `/api/nutrition/week` | Неделя |
| GET | `/api/nutrition/chart?period=week\|month` | Графики |
| GET | `/api/nutrition/history` | История |
| POST | `/api/nutrition/photo` | AI-анализ фото |
| POST | `/api/nutrition` | Добавить запись |
| DELETE | `/api/nutrition/:id` | Удалить запись |
| GET | `/api/nutrition/foods/search?q=` | Поиск продуктов |
| GET | `/api/nutrition/recommendations` | AI-советы |
| GET | `/api/nutrition/analytics` | Аналитика 30 дней |
| PUT | `/api/nutrition/profile` | Профиль (вес, цель) |

### Admin

| Метод | Путь |
|-------|------|
| GET | `/api/admin/nutrition/stats` |
| GET/POST | `/api/admin/nutrition/foods` |
| POST | `/api/admin/nutrition/premium/grant` |
| POST | `/api/admin/nutrition/premium/revoke` |

## База данных

Миграция: `database/migrations/027_nutrition_premium.sql`

Таблицы: `user_subscriptions`, `user_nutrition_profile`, `food_categories`, `nutrition_foods`, `nutrition_logs`, `nutrition_favorites`, `nutrition_ai_results`, `nutrition_diary_streaks`.

## AI-распознавание

1. Пользователь загружает фото (камера / галерея)
2. Backend вызывает OpenAI Vision (если `OPENAI_API_KEY` задан)
3. Fallback: предложение блюд из локальной базы (TJ/UZ/RU)
4. При confidence < 80% — выбор из альтернатив
5. Пользователь редактирует и подтверждает

### Переменные окружения

```env
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_VISION_MODEL=gpt-4o-mini
NUTRITION_DEV_FREE=1   # dev: доступ без подписки
```

## Установка

```bash
cd backend
npm run db:setup
```

Выдать Premium клиенту: **Админ → Питание → Выдать RunBonus+**

## Mobile

- Экран: `/nutrition`
- Вход: **Сводка → Питание RunBonus+**
- Компоненты: `mobile/src/components/nutrition/`

## Национальная кухня (seed)

Таджикистан: плов, курутоб, шашлык, манту, самбуса, шурбо, оши бурида, тушбера, лепёшка, чака, каймак.  
Россия: борщ, пельмени, блины.  
Узбекистан: плов, лагман.

## Критерии приёмки

- [x] Дневной баланс и история
- [x] AI-фото с fallback
- [x] Premium gate
- [x] Admin: продукты, статистика, выдача подписки
- [x] Push при превышении/достижении нормы
- [x] Streak tracking
- [ ] In-app purchase (App Store / Play) — следующий этап
- [ ] Offline sync — следующий этап

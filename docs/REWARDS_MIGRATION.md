# Миграция на систему наград (RunBonus)

## Цель

Убрать денежную модель (сводка / кошелёк / вывод / money-per-km) и перейти на milestones → подарки.

## Миграции БД (порядок)

1. `036_rewards_system.sql` — таблицы rewards/milestones + seed 50/100/200/300/500
2. `037_deprecate_money_wallet.sql` — `bonus_settings.price_per_km = 0`
3. `038_reward_colors.sql` — цвета бутылки + `color_options`
4. `039_zero_level_price_per_km.sql` — обнулить тарифы уровней
5. `040_disable_bonus_payment_method.sql` — отключить оплату бонусами в магазине

## Навигация mobile

Главная · Тренировки · Награды · Профиль

Редиректы: `/summary` → `/`, `/wallet` → `/rewards`, `/history` → `/workouts`

## API

- Активные: `/api/rewards/*`, `/api/me`, `/api/workouts`
- Deprecated (410): `/api/bonus/*`, `/api/user/summary`, `/api/admin/bonus/*`, `/api/admin/bonus-fund`

## Критерии готовности

- [x] Сводка/Кошелёк удалены из навигации
- [x] Деньги за км не начисляются
- [x] Backend подтверждает дистанцию + unlock milestones
- [x] Выбор одной награды, размер футболки, промокод скидки
- [x] Админ: награды / склад / доставка / промо / статистика
- [x] Telegram + push
- [x] Магазин отделён (оплата деньгами)
- [x] Документация обновлена (API, MOBILE, README, DATABASE, ADMIN)

## После деплоя

```bash
# применить миграции на prod DB
mysql … < database/migrations/036_rewards_system.sql
mysql … < database/migrations/037_deprecate_money_wallet.sql
mysql … < database/migrations/038_reward_colors.sql
mysql … < database/migrations/039_zero_level_price_per_km.sql
mysql … < database/migrations/040_disable_bonus_payment_method.sql
```

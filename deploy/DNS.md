# Домен runbonus.online и API

## Проблема CORS «Redirect is not allowed for a preflight request»

Сейчас в Namecheap включён **URL Forward** (перенаправление) на IP. Браузер отправляет `OPTIONS` на `http://runbonus.online`, получает **302 Redirect** — CORS ломается.

Прямой адрес API работает: `http://161.129.67.147/api/health`

## Правильная настройка (рекомендуется)

1. В панели Namecheap: **удалить** URL Redirect / Forward для `runbonus.online`.
2. В **Advanced DNS** добавить записи:
   - **A Record** `@` → `161.129.67.147`
   - **A Record** `www` → `161.129.67.147` (по желанию)
3. Подождать 5–30 минут (распространение DNS).
4. Проверка:
   ```bash
   curl -I http://runbonus.online/api/health
   ```
   Должен быть **200 OK**, без `302` и без `Namecheap URL Forward`.

5. В проекте снова указать в `mobile/.env.production`:
   ```
   VITE_API_URL=http://runbonus.online
   ```
   и пересобрать приложение.

## Мобильное приложение

В `mobile/.env.production` указано: `VITE_API_URL=http://runbonus.online`  
Запросы идут на `http://runbonus.online/api/...` (путь `/api` добавляется в коде).

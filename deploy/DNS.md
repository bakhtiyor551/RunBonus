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

## Мобильное приложение и CORS

Если в Namecheap снова включён **URL Forward**, `http://runbonus.online` отвечает **302** на IP — в браузере появляется **ошибка CORS** при входе.

**Решения:**
1. Отключить Forward, настроить **A-запись** на `161.129.67.147` (см. выше).
2. В APK запросы идут через **CapacitorHttp** (обходит CORS) — пересоберите приложение.
3. Временно в `mobile/.env.production`: `VITE_API_URL=http://161.129.67.147`

В `mobile/.env.production` по умолчанию: `http://runbonus.online`  
Запросы: `http://runbonus.online/api/...`

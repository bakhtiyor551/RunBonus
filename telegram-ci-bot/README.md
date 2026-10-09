# Telegram CI-бот RunBonus

Кнопка **▶ Собрать сейчас** → Jenkins Pipeline `RunBonus/master`.

## Быстрый старт на VPS

1. В Jenkins: пользователь → **Configure** → **API Token** → Generate.
2. В Telegram найдите бота и напишите `/start` (узнаете chat id из ответа при отказе, либо из `@userinfobot`).
3. Запуск:

```bash
export TELEGRAM_BOT_TOKEN='...'
export TELEGRAM_ALLOWED_CHAT_IDS='YOUR_CHAT_ID'
export JENKINS_USER='bakhtiyor'
export JENKINS_API_TOKEN='...'
sudo -E ./deploy/setup-telegram-ci-bot.sh
```

4. В Jenkins Credentials задайте `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` (тот же бот и chat) — иначе этапы не шлют ⏳/✅/❌.

## Безопасность

- Разрешены только chat id из `TELEGRAM_ALLOWED_CHAT_IDS`.
- Пока job в очереди или building — повторный запуск отклоняется.
- Jenkins слушает `127.0.0.1:8080`; бот ходит к нему по Docker-сети.
- Файл `/opt/runbonus/telegram-ci.env` не коммитить (`chmod 600`).

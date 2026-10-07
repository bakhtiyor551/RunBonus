# CI/CD RunBonus: Docker + Jenkins

Автоматическая сборка, проверка и выкат backend. Мобильные сборки — отдельный Jenkins job (`Jenkinsfile.mobile`).

## Поток

```
git push
  → Jenkins
    → Checkout → npm ci → Lint → Tests → Build → Docker Build
      develop / dev_run → Deploy STAGING → Health
      main / master     → Backup DB → Migration → Deploy PRODUCTION → Health
        ✅ Telegram SUCCESS
        ❌ stop + rollback (production) + Telegram FAILED
```

Production не обновляется, если lint, tests, build, migration или health завершились ошибкой.

## Что уже есть в репозитории

| Файл | Назначение |
|------|------------|
| `backend/Dockerfile` | Multi-stage image, non-root user, `CMD node src/index.js` |
| `docker-compose.yml` | Локальный стек |
| `docker-compose.prod.yml` | Production: api, mysql, redis, nginx |
| `docker-compose.staging.yml` | Staging с отдельными volumes (`*-stage`) |
| `docker-compose.jenkins.yml` | Jenkins **отдельно** от production |
| `Jenkinsfile` | Backend CI/CD |
| `Jenkinsfile.mobile` | Android (linux) / iOS (macos agent) |
| `deploy/remote-deploy.sh` | Build + migrate + up **без** `down -v` |
| `deploy/backup-db.sh` | Daily / weekly / monthly в `/backup/runbonus/` |
| `deploy/rollback.sh` | Предыдущий image tag |
| `.env.example` | Шаблон переменных (секреты не коммитить) |

Backend в этом репозитории — **JavaScript**, не TypeScript. Образ запускает `src/index.js`, порт внутри контейнера **3000**. Снаружи только Nginx `:80` / `:443`.

Текущие git-ветки проекта (`dev_run`, `master`) подключены наряду с `develop` / `main` из ТЗ.

## 1. Docker на VPS

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

Первый запуск стека (каталог репозитория, например `/opt/runbonus`):

```bash
cp .env.example .env
# заполните пароли, JWT, Telegram — только на сервере
chmod +x deploy/*.sh
./deploy/ensure-certs.sh
./deploy/firewall.sh
IMAGE_TAG=1.0.0.0 ./deploy/remote-deploy.sh
sudo ./deploy/install-backup-cron.sh
```

По умолчанию API слушает **`127.0.0.1:3000`**. Хостовый nginx (уже на 80/443) должен проксировать на него.  
Docker-nginx включается отдельно (когда готовы отдать ему 80/443):

```bash
docker compose -f docker-compose.prod.yml --profile edge up -d
```

Health: `curl -f http://127.0.0.1:3000/health`

Существующий systemd `runbonus-api` остановите **после** успешного health нового стека (и смены proxy_pass на `:3000`):

```bash
sudo systemctl disable --now runbonus-api
```

Docker MariaDB — **отдельная** БД (volume `mysql_data`). На пустой БД `migrate` сначала применяет `database/schema.sql`, затем SQL-миграции.

Данные с хостового MySQL перенесите дампом **перед** cutover (иначе будет пустая схема):

```bash
# пример: дамп хоста → в контейнер
mysqldump -u... -p... runbonus | gzip > /tmp/host.sql.gz
gunzip -c /tmp/host.sql.gz | docker exec -i runbonus-mysql mariadb -urunbonus -p... runbonus
```

Данные хостового MySQL перенесите дампом в контейнер `runbonus-mysql` до отключения старой БД.

## 2. Jenkins (отдельный compose)

```bash
sudo mkdir -p /var/jenkins_home
docker compose -f docker-compose.jenkins.yml up -d
# пароль администратора:
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Каталог Jenkins должен быть **`/var/jenkins_home` и на хосте, и в контейнере**. Иначе `docker run -v $PWD/backend:/app` монтирует пустую папку хоста, и `npm ci` не видит `package-lock.json`.

UI: `http://127.0.0.1:8080` (пробросьте SSH-туннель или отдельный внутренний proxy). Не открывайте 8080 в интернет без HTTPS и ACL.

В `docker-compose.jenkins.yml` смонтированы `/var/jenkins_home` и `/opt/runbonus` (read-only) — агент видит production `.env`.

Плагины: Pipeline, Git, Credentials Binding, Docker Pipeline, SSH Agent.

### Credentials (ID как в pipeline)

| ID | Тип | Зачем |
|----|-----|--------|
| `GIT_SSH_KEY` | SSH Username with private key | Checkout (настраивается в job) |
| `PRODUCTION_SSH_KEY` | SSH Username with private key | Если Jenkins не на том же VPS |
| `DOCKER_REGISTRY` | Username/password | Опциональный push образа |
| `DATABASE_SECRET` | Secret text | Не писать в Jenkinsfile; `.env` на VPS |
| `TELEGRAM_BOT_TOKEN` | Secret text | Уведомления |
| `TELEGRAM_CHAT_ID` | Secret text | Уведомления |

Запрещено: пароли в `Jenkinsfile`.

### Job backend

1. New Item → Multibranch Pipeline (или Pipeline).
2. Branch sources: Git, credential `GIT_SSH_KEY`.
3. Script path: `Jenkinsfile`.
4. GitHub/GitLab webhook → `https://<jenkins>/github-webhook/` (или GitLab webhook).

Ветки:

- `feature/*`, `fix/*` — только CI (lint/test/build/image).
- `develop` / `dev_run` — CI + staging (`api-stage`, порт 8080).
- `main` / `master` — CI + Deploy PRODUCTION (`remote-deploy.sh`: mysql up → backup → migration → up → health).
  Первый деплой без контейнера MySQL: backup пропускается с warning, не падает.

Секреты **не** кладите в workspace Jenkins (checkout их сотрёт). Один раз на VPS:

```bash
# из текущего backend/.env (systemd) → Docker-совместимый файл
sudo ./deploy/bootstrap-env-from-backend.sh /opt/runbonus/backend/.env /opt/runbonus/.env
# или вручную:
# sudo mkdir -p /opt/runbonus
# sudo cp .env.example /opt/runbonus/.env   # затем заполните пароли
# sudo chmod 600 /opt/runbonus/.env
```

Staging (отдельный файл):

```bash
sudo cp .env.staging.example /opt/runbonus/.env.staging
sudo chmod 600 /opt/runbonus/.env.staging
```

Pipeline копирует их в workspace через `deploy/prepare-env.sh` перед deploy.

## 3. Rollback

После каждого успешного production-деплоя пишутся `.release` и `.release.previous`.

```bash
./deploy/rollback.sh          # тег из .release.previous
./deploy/rollback.sh 1.0.0.12 # явный тег
```

Проверка: сломайте health (неверный IMAGE_TAG) → Jenkins `post.failure` вызывает rollback на production.

Образы: `runbonus-api:1.0.0.12`, `runbonus-api:git-a82f31c`, не только `latest`.

## 4. Миграции

`npm run migration` → `backend/src/migrate.js`.

- Таблица `schema_migrations` — versioned, повторный прогон безопасен.
- Файлы с `destructive` / `drop_all` в имени не применяются без `ALLOW_DESTRUCTIVE_MIGRATIONS=1`.
- Перед production: backup → migration → deploy → `/health`.

## 5. Health

```http
GET /health
GET /api/health
```

```json
{
  "status": "ok",
  "service": "runbonus-api",
  "database": "ok",
  "redis": "ok",
  "ok": true
}
```

`redis: "skipped"`, если `REDIS_URL` пустой (локальный systemd без Redis).

## 6. Логи

```bash
docker logs runbonus-api
docker logs runbonus-nginx
```

Jenkins хранит лог сборки, тестов, docker build, migration, deploy. Не `echo` паролей и JWT.

## 7. Firewall

Открыть: `22`, `80`, `443`. Не открывать: `3306`, `6379`, `3000`. Скрипт: `deploy/firewall.sh`.

## 8. Mobile CI/CD

Отдельный job, script path `Jenkinsfile.mobile`.

- Android: agent label `linux`, артефакт AAB.
- iOS: agent label `macos` (Xcode). Подпись и TestFlight — credentials на Mac, не в Git.

## 9. Чеклист готовности

- [ ] Docker на VPS
- [ ] Jenkins (отдельный compose) и webhook
- [ ] Backend-образ собирается
- [ ] MariaDB и Redis с named volumes
- [ ] Nginx + HTTPS
- [ ] `.env` только на сервере / в Credentials
- [ ] CI lint/tests/build
- [ ] Staging с отдельной БД
- [ ] Production после merge в `main`/`master`
- [ ] Backup перед migration
- [ ] `/health` после deploy
- [ ] Rollback проверен
- [ ] Telegram success/fail
- [ ] MySQL/Redis не торчат в интернет
- [ ] Android/iOS — отдельные job/agents

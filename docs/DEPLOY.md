# Развёртывание

Весь стек (бот, API, редактор, Postgres, Redis, Caddy) работает на одном сервере. Образы собираются на вашем компьютере и передаются на сервер по ssh: сборки на сервере нет, исходный код туда не попадает. Домен не нужен: адрес даёт сервис sslip.io, сертификат Caddy выпускает сам.

## 1. Что нужно

- Токен бота от @BotFather.
- Тестовый чат (группа с ботом) и его id: он пойдёт в `TELEGRAM_MANAGER_CHAT_ID`. На проверке используйте только его, рабочий чат менеджеров подключайте после приёмки.
- VPS от 1 ГБ памяти (лимиты контейнеров: postgres 256 МБ, app 256 МБ, redis 64 МБ, caddy 64 МБ), 10 ГБ диска, Ubuntu 24.04, публичный IPv4, доступ по ssh.
- На вашем компьютере: Docker, `ssh`, `rsync`.

Токен бота нельзя запускать одновременно локально и на сервере: Telegram вернёт конфликт (`Conflict: terminated by other getUpdates request`). Перед выкладкой остановите локальный бот.

## 2. Адрес

DNS настраивать не нужно. Возьмите IP сервера и замените точки дефисами, добавив `.sslip.io`. IP `203.0.113.10` даёт адрес `203-0-113-10.sslip.io`.

## 3. Подготовка сервера (один раз)

Подключитесь по ssh и выполните:

```
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

Выйдите и зайдите по ssh заново, чтобы группа `docker` вступила в силу; проверьте `docker compose version`. Порт 22 открывайте до `ufw enable`, иначе потеряете доступ. Если у провайдера есть свой файрвол, там тоже нужны 22/tcp, 80/tcp, 443/tcp и 443/udp.

Создайте каталог и файл настроек:

```
mkdir -p ~/brief-bot
cd ~/brief-bot
nano .env
chmod 600 .env
```

Содержимое `.env` (шаблон: `.env.example` в репозитории; значения придумайте и впишите свои):

| Переменная | Значение |
|---|---|
| `TELEGRAM_TOKEN` | токен бота |
| `TELEGRAM_MANAGER_CHAT_ID` | id тестового чата (для группы число отрицательное) |
| `TELEGRAM_INVITE_CODE` | придуманный код для первого входа, например `openssl rand -hex 8` |
| `TELEGRAM_POLLING_ENABLED` | `true` |
| `SITE_ADDRESS` | `203-0-113-10.sslip.io` (без `https://`) |
| `EDITOR_BASE_URL` | `https://203-0-113-10.sslip.io` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24`: латиница и цифры, символы вроде `@` и `/` сломают строку подключения |

`POSTGRES_DSN` и `REDIS_URL` на сервере не нужны: compose собирает их сам. `.env` не попадает в git (он в `.gitignore`), не копируйте его никуда и не отправляйте в чаты. Скрипт выкладки `.env` не трогает.

## 4. Выкладка

С вашего компьютера, из корня репозитория:

```
deploy/deploy.sh user@203.0.113.10
```

Скрипт собирает образы `brief-bot-app` и `brief-bot-caddy`, передаёт их на сервер (`docker save | gzip | ssh ... docker load`), копирует на сервер только `docker-compose.prod.yml` в `~/brief-bot/` и запускает `docker compose up -d --no-build`. Первая сборка занимает несколько минут, передача около 120 МБ. Миграции и начальный сценарий применяются при старте приложения сами.

## 5. Проверка

На сервере в `~/brief-bot`:

```
docker compose -f docker-compose.prod.yml ps
curl -sI https://203-0-113-10.sslip.io/
curl -s https://203-0-113-10.sslip.io/health
```

- В `ps` у `postgres`, `redis` и `app` статус `healthy`, у `caddy` `running`.
- Первый ответ: `HTTP/2 200` с валидным сертификатом (при первом запуске выпуск занимает до минуты).
- Второй: `{"status":"ok"}`.
- Ошибки приложения: `docker compose -f docker-compose.prod.yml logs app`.
- Сертификат не выдался: `docker compose -f docker-compose.prod.yml logs caddy`. Частые причины: закрыты 80 или 443 в файрволе, `SITE_ADDRESS` с ошибкой или с `https://`.

В боте: `/start`, полный проход по сценарию, заявка приходит в тестовый чат.

## 6. Первый вход в редактор

В личных сообщениях боту отправьте `/editor <код>`, где код равен `TELEGRAM_INVITE_CODE` из `.env`. Бот вернёт ссылку вида `https://203-0-113-10.sslip.io/login?token=...`. Откройте её в браузере: ссылка одноразовая и живёт 10 минут, она делает вас администратором и открывает редактор. Дальше достаточно `/editor` без кода. Публикация сценария в редакторе меняет тексты в боте.

## 7. Обновление и откат

Обновление: `git pull` у себя и снова `deploy/deploy.sh user@203.0.113.10`. Данные лежат в именованных томах и обновление переживают.

Перед загрузкой новых образов скрипт на сервере помечает прошлые как `brief-bot-app:previous` и `brief-bot-caddy:previous`. Откат на сервере в `~/brief-bot`:

```
docker tag brief-bot-app:previous brief-bot-app:latest
docker tag brief-bot-caddy:previous brief-bot-caddy:latest
docker compose -f docker-compose.prod.yml up -d --no-build
```

Откат возвращает код, а не данные: схему базы он не меняет. После двух выкладок подряд `:previous` указывает на предыдущую версию, а не на самую первую.

## 8. Резервная копия Postgres

На сервере в `~/brief-bot`:

```
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U brief brief | gzip > ~/brief-$(date +%F).sql.gz
```

Ежедневно в 03:15 через `cron` (`crontab -e`; в crontab символ `%` экранируется):

```
15 3 * * * cd ~/brief-bot && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U brief brief | gzip > ~/backups/brief-$(date +\%F).sql.gz
```

Каталог `~/backups` создайте заранее (`mkdir -p ~/backups`) и периодически копируйте файлы с сервера: копия на том же диске не спасает от потери сервера. Старые копии удаляйте сами. Том `caddy_data` (сертификаты) терять нежелательно: Let's Encrypt ограничивает число новых выпусков, а `down -v` его удалит.

### Восстановление

Строго в этом порядке, в `~/brief-bot`. Приложение останавливается первым: иначе оно держит соединения с базой, и она не удалится.

```
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml exec -T postgres psql -U brief -d postgres -c "DROP DATABASE brief WITH (FORCE)"
docker compose -f docker-compose.prod.yml exec -T postgres psql -U brief -d postgres -c "CREATE DATABASE brief OWNER brief"
gunzip -c ~/backups/brief-2026-01-01.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U brief -d brief -v ON_ERROR_STOP=1 -q
docker compose -f docker-compose.prod.yml start app
```

Дальше повторите проверку из раздела 5. Действующие сессии редактора лежат в Redis и базу не затрагивают.

## 9. Остановка

```
docker compose -f docker-compose.prod.yml down
```

Ключ `-v` удаляет тома вместе с базой и сертификатами: без резервной копии его не используйте.

## Что наружу

Открыты только 80 и 443 (tcp и udp) у Caddy. У Postgres и Redis публикуемых портов нет, они видны только приложению внутри сети compose; поэтому у Redis нет пароля. Redis ограничен 32 МБ с политикой `noeviction`: сессии редактора не вытесняются. Логи контейнеров ротируются (3 файла по 10 МБ). Caddy не пишет access-лог: в адресе `/login` лежит токен входа, и в логах ему не место. Тело запроса к `/api` ограничено 5 МБ.

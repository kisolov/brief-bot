# Развёртывание

Весь стек (бот, API, редактор, Postgres, Redis, Caddy) поднимается одной командой на одном сервере. Домен не нужен: адрес даёт сервис sslip.io, сертификат Caddy выпускает сам.

## 1. Что нужно

- Токен бота от @BotFather.
- Тестовый чат (группа с ботом) и его id: он пойдёт в `TELEGRAM_MANAGER_CHAT_ID`. На проверке используйте только его, рабочий чат менеджеров подключайте после приёмки.
- VPS: 1 vCPU, 1 ГБ памяти, 10 ГБ диска, Ubuntu 24.04, публичный IPv4. В файрволе провайдера открыты порты 80/tcp, 443/tcp и 443/udp.
- Docker с плагином compose (`docker compose version` отвечает). Установка по инструкции с docs.docker.com/engine/install.

## 2. Адрес

DNS настраивать не нужно. Возьмите IP сервера и замените точки дефисами, добавив `.sslip.io`. IP `203.0.113.10` даёт адрес `203-0-113-10.sslip.io`.

## 3. Файлы на сервере

```
git clone <адрес-репозитория> brief-bot
cd brief-bot
cp .env.example .env
chmod 600 .env
```

Откройте `.env` и заполните:

| Переменная | Значение |
|---|---|
| `TELEGRAM_TOKEN` | токен бота |
| `TELEGRAM_MANAGER_CHAT_ID` | id тестового чата (для группы число отрицательное) |
| `TELEGRAM_INVITE_CODE` | придуманный код для первого входа, например `openssl rand -hex 8` |
| `TELEGRAM_POLLING_ENABLED` | `true` |
| `SITE_ADDRESS` | `203-0-113-10.sslip.io` (без `https://`) |
| `EDITOR_BASE_URL` | `https://203-0-113-10.sslip.io` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24`: латиница и цифры, символы вроде `@` и `/` сломают строку подключения |

`POSTGRES_DSN` и `REDIS_URL` в `.env` на сервере не нужны: compose собирает их сам. `.env` в git не попадает, не копируйте его никуда и не отправляйте в чаты.

## 4. Запуск

```
docker compose -f docker-compose.prod.yml up -d --build
```

Первая сборка занимает несколько минут. Миграции и начальный сценарий применяются при старте приложения сами.

## 5. Проверка

```
docker compose -f docker-compose.prod.yml ps
curl -sI https://203-0-113-10.sslip.io/
curl -s https://203-0-113-10.sslip.io/health
```

- В `ps` у `postgres`, `redis` и `app` статус `healthy`, у `caddy` `running`.
- Первый ответ: `HTTP/2 200` с валидным сертификатом (при первом запуске выпуск занимает до минуты).
- Второй: `{"status":"ok"}`.
- Ошибки приложения: `docker compose -f docker-compose.prod.yml logs app`.

В боте: `/start`, полный проход по сценарию, заявка приходит в тестовый чат.

## 6. Первый вход в редактор

В личных сообщениях боту отправьте `/editor <код>`, где код равен `TELEGRAM_INVITE_CODE` из `.env`. Бот вернёт ссылку вида `https://203-0-113-10.sslip.io/login?token=...`. Откройте её в браузере: ссылка одноразовая и живёт 10 минут, она делает вас администратором и открывает редактор. Дальше достаточно `/editor` без кода. Публикация сценария в редакторе меняет тексты в боте.

## 7. Обновление

```
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Данные лежат в именованных томах и обновление переживают.

## 8. Резервная копия Postgres

```
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U brief brief | gzip > brief-$(date +%F).sql.gz
```

Файл сохраните вне сервера. Восстановление в чистую базу:

```
gunzip -c brief-2026-01-01.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U brief brief
```

## 9. Остановка

```
docker compose -f docker-compose.prod.yml down
```

Ключ `-v` удаляет тома вместе с базой и сертификатами: без резервной копии его не используйте.

## Что наружу

Открыты только 80 и 443 (tcp и udp) у Caddy. У Postgres и Redis публикуемых портов нет, они видны только приложению внутри сети compose. Caddy не пишет access-лог: в адресе `/login` лежит токен входа, и в логах ему не место. Тело запроса к `/api` ограничено 5 МБ.

# Карта сервисов

Один процесс, один контейнер зависимостей (модульный монолит). Описано то, что есть в коде сейчас. Спецификация: [spec](../superpowers/specs/2026-10-30-brief-bot-design.md), план: [plan](../superpowers/plans/2026-10-30-brief-bot.md).

## Домены

| Домен | Назначение | Статус | Документы |
|---|---|---|---|
| `scenario` | Модель сценария, разбор JSON, проверка, версии и черновик | написан | [scenario](scenario/ARCHITECTURE.md) |
| `dialog` | Движок диалога (чистая функция), сессии, очередь напоминаний | движок и хранение написаны, usecase-слой запланирован | [dialog](dialog/ARCHITECTURE.md) |
| `leads` | Заявки, форматирование для менеджера | запланирован | нет |
| `access` | Администраторы, токены входа в редактор | запланирован | нет |

Зависимости: `dialog` → `scenario`, `dialog` → `leads`. `scenario` и `leads` друг о друге не знают.

## Общий слой `backend/src/shared`

| Файл | Что |
|---|---|
| [exceptions.py](../../backend/src/shared/exceptions.py) | `DomainException`, `NotFound`, `UniqueViolation` |
| [logger.py](../../backend/src/shared/logger.py) | `get_logger` |
| [asyncpg_db.py](../../backend/src/shared/asyncpg_db.py) | `PostgresSettings`, `AsyncpgDatabase`: пул, jsonb как python-объект |
| [redis_client.py](../../backend/src/shared/redis_client.py) | `RedisSettings`, `initialize` для `providers.Resource` |
| [migrate.py](../../backend/src/shared/migrate.py) | Раннер миграций из [migrations](../../backend/migrations) |

## Хранилища

| Что | Где | Адаптер |
|---|---|---|
| Версии сценария, черновик | postgres `scenario_versions`, `scenario_draft` | [AsyncpgScenarioRepository](../../backend/src/scenario/adapters/asyncpg.py) |
| Сессии | redis `session:<chat_id>`, TTL 30 дней | [RedisSessionRepository](../../backend/src/dialog/adapters/redis.py) |
| Очередь напоминаний | redis ZSET `reminders` | [RedisReminderQueue](../../backend/src/dialog/adapters/redis.py) |
| Заявки, администраторы, токены, настройки | postgres `leads`, `admins`, `editor_tokens`, `settings` | таблицы созданы в [001_init.sql](../../backend/migrations/001_init.sql), адаптеров ещё нет |

Подключение: `POSTGRES_DSN` (по умолчанию `postgresql://brief:brief@localhost:55432/brief`) и `REDIS_URL` (по умолчанию `redis://localhost:56379/0`); значения по умолчанию совпадают с `docker-compose.yml`. DI-контейнера и точки входа пока нет.

## Миграции

SQL-файлы `backend/migrations/NNN_*.sql` применяются по порядку имён, каждый в своей транзакции под advisory-блокировкой; применённые имена пишутся в `schema_migrations`. Повторный запуск ничего не меняет. Вызывать раннер из `lifespan` предстоит позже.

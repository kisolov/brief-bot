# Карта сервисов

Один процесс, один контейнер зависимостей (модульный монолит). Описано то, что есть в коде сейчас. Спецификация: [spec](../superpowers/specs/2026-10-30-brief-bot-design.md), план: [plan](../superpowers/plans/2026-10-30-brief-bot.md).

## Домены

| Домен | Назначение | Статус | Документы |
|---|---|---|---|
| `scenario` | Модель сценария, разбор JSON, проверка, версии и черновик | написан | [scenario](scenario/ARCHITECTURE.md) |
| `dialog` | Движок диалога (чистая функция), сессии, очередь напоминаний | движок, хранение, сервис и usecase написаны; Telegram-адаптер в `bootstrap` | [dialog](dialog/ARCHITECTURE.md) |
| `leads` | Заявки, форматирование для менеджера | сервис, хранилища, порт уведомления и Telegram-адаптер написаны; usecase-слоя нет | [leads](leads/ARCHITECTURE.md) |
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
| Заявки | postgres `leads` | [AsyncpgLeadRepository](../../backend/src/leads/adapters/asyncpg.py) |
| Администраторы, токены, настройки | postgres `admins`, `editor_tokens`, `settings` | таблицы созданы в [001_init.sql](../../backend/migrations/001_init.sql), адаптеров ещё нет |

Подключение: `POSTGRES_DSN` (по умолчанию `postgresql://brief:brief@localhost:55432/brief`) и `REDIS_URL` (по умолчанию `redis://localhost:56379/0`, оба `SecretStr`); значения по умолчанию совпадают с `docker-compose.yml`. Telegram: `TELEGRAM_TOKEN`, `TELEGRAM_MANAGER_CHAT_ID`, `TELEGRAM_INVITE_CODE` (обязательные, токен и код `SecretStr`), `TELEGRAM_POLLING_ENABLED` (по умолчанию `true`). Образец: [.env.example](../../.env.example).

## Миграции

SQL-файлы `backend/migrations/NNN_*.sql` применяются по порядку имён, каждый в своей транзакции под advisory-блокировкой; применённые имена пишутся в `schema_migrations`. Повторный запуск ничего не меняет. Раннер вызывается из `lifespan` при каждом старте.

## Точка входа `backend/src/bootstrap`

Запуск: `uvicorn src.bootstrap.app:app` из `backend`.

| Файл | Что |
|---|---|
| [app.py](../../backend/src/bootstrap/app.py) | `create_app(container)`: FastAPI с `lifespan` и `GET /health` (без авторизации, `{"status": "ok"}`, для деплоя); `app` для uvicorn |
| [di.py](../../backend/src/bootstrap/di.py) | `Container`: настройки, порты (`AbstractSingleton`), адаптеры, сервисы, usecase, роутер и диспетчер aiogram; порты привязаны к боевым адаптерам отдельными строками `override`. Для тестов объявлены именованные провайдеры `memory_*` и `mock_manager_notifier` |
| [settings.py](../../backend/src/bootstrap/settings.py) | `TelegramSettings` (префикс `TELEGRAM_`) |
| [telegram/router.py](../../backend/src/bootstrap/telegram/router.py) | апдейт в `Event`, вызов `HandleEvent` или `ResumeOrRestart`, обработчик ошибок |
| [telegram/render.py](../../backend/src/bootstrap/telegram/render.py) | `Screen` в клавиатуру и сообщение |
| [telegram/callback.py](../../backend/src/bootstrap/telegram/callback.py) | `callback_data` |

`lifespan`: `init_resources` (пул postgres, redis, бот) -> миграции -> `EnsureSeeded` -> если `polling_enabled`, `start_polling` отдельной задачей -> работа -> на выходе отмена задачи и `shutdown_resources` (пул, redis, сессия бота). Подробности, ограничения и сбои: [dialog](dialog/ARCHITECTURE.md), [INVARIANTS](dialog/INVARIANTS.md), [FAILURE_MODES](dialog/FAILURE_MODES.md).

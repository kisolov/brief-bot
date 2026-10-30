# Карта сервисов

Один процесс, один контейнер зависимостей (модульный монолит). Описано то, что есть в коде сейчас. Спецификация: [spec](../superpowers/specs/2026-10-30-brief-bot-design.md), план: [plan](../superpowers/plans/2026-10-30-brief-bot.md).

## Домены

| Домен | Назначение | Статус | Документы |
|---|---|---|---|
| `scenario` | Модель сценария, разбор JSON, проверка, версии и черновик | написан | [scenario](scenario/ARCHITECTURE.md) |
| `dialog` | Движок диалога (чистая функция), сессии, очередь напоминаний | движок, хранение, сервис и usecase написаны; Telegram-адаптер в `bootstrap` | [dialog](dialog/ARCHITECTURE.md) |
| `leads` | Заявки, форматирование для менеджера, файл ТЗ | сервис, хранилища, порты уведомления и скачивания файла, usecase и DTO для редактора написаны | [leads](leads/ARCHITECTURE.md) |
| `access` | Администраторы, токены входа в редактор | написан | [access](access/ARCHITECTURE.md) |

HTTP-контракт редактора: [API.md](API.md).

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
| Администраторы | postgres `admins` | [AsyncpgAdminRepository](../../backend/src/access/adapters/asyncpg.py) |
| Токены редактора (хеши) | postgres `editor_tokens` | [AsyncpgTokenRepository](../../backend/src/access/adapters/asyncpg.py) |
| Настройки напоминания | postgres `settings`, ключ `reminder` | [AsyncpgSettingsRepository](../../backend/src/dialog/adapters/asyncpg.py) |

Подключение: `POSTGRES_DSN` (по умолчанию `postgresql://brief:brief@localhost:55432/brief`) и `REDIS_URL` (по умолчанию `redis://localhost:56379/0`, оба `SecretStr`); значения по умолчанию совпадают с `docker-compose.yml`. Telegram: `TELEGRAM_TOKEN`, `TELEGRAM_MANAGER_CHAT_ID`, `TELEGRAM_INVITE_CODE` (обязательные, токен и код `SecretStr`), `TELEGRAM_POLLING_ENABLED` (по умолчанию `true`). Редактор: `EDITOR_BASE_URL` (обязательная, база ссылки из `/editor`, хвостовой `/` срезается). Образец: [.env.example](../../.env.example).

## Миграции

SQL-файлы `backend/migrations/NNN_*.sql` применяются по порядку имён, каждый в своей транзакции под advisory-блокировкой; применённые имена пишутся в `schema_migrations`. Повторный запуск ничего не меняет. Раннер вызывается из `lifespan` при каждом старте.

## Точка входа `backend/src/bootstrap`

Запуск: `uvicorn src.bootstrap.app:app` из `backend`.

| Файл | Что |
|---|---|
| [app.py](../../backend/src/bootstrap/app.py) | `create_app(container)`: FastAPI с `lifespan`, `GET /health` (без авторизации, `{"status": "ok"}`, для деплоя), роутерами `/api/*` и обработчиками доменных ошибок; `docs_url`, `redoc_url`, `openapi_url` выключены (`app.openapi()` работает для тестов); `container.wire` на модули эндпойнтов; `app` для uvicorn |
| [endpoints/](../../backend/src/bootstrap/endpoints) | `auth`, `scenario`, `leads`, `settings`: только DTO и вызов usecase через `@inject`; контракт в [API.md](API.md) |
| [utils/session.py](../../backend/src/bootstrap/utils/session.py) | зависимость `require_session`: cookie `editor_session` в `CheckEditorSession`, иначе `InvalidEditorToken` (401) |
| [utils/exception_handlers.py](../../backend/src/bootstrap/utils/exception_handlers.py) | `DomainException` в HTTP-статус, один `logger.warning("Business rejection")` на отказ |
| [di.py](../../backend/src/bootstrap/di.py) | `Container`: настройки, порты (`AbstractSingleton`), адаптеры, сервисы, usecase, роутер и диспетчер aiogram; порты привязаны к боевым адаптерам отдельными строками `override`. Для тестов объявлены именованные провайдеры `memory_*` и `mock_manager_notifier` |
| [settings.py](../../backend/src/bootstrap/settings.py) | `TelegramSettings` (префикс `TELEGRAM_`), `EditorSettings` (префикс `EDITOR_`) |
| [telegram/router.py](../../backend/src/bootstrap/telegram/router.py) | апдейт в `Event`, вызов `HandleEvent` или `ResumeOrRestart`, команда `/editor` (вызов `IssueEditorLink`, сессию анкеты не трогает), обработчик ошибок |
| [telegram/render.py](../../backend/src/bootstrap/telegram/render.py) | `Screen` в клавиатуру и сообщение |
| [telegram/callback.py](../../backend/src/bootstrap/telegram/callback.py) | `callback_data` |

`lifespan`: настройки (`TelegramSettings`, `EditorSettings`: неверная конфигурация падает до подключения к базам) -> `init_resources` (пул postgres, redis, бот) -> миграции -> `EnsureSeeded` -> если `polling_enabled`, `start_polling` отдельной задачей -> работа -> на выходе отмена задачи и `shutdown_resources` (пул, redis, сессия бота). Подробности, ограничения и сбои: [dialog](dialog/ARCHITECTURE.md), [INVARIANTS](dialog/INVARIANTS.md), [FAILURE_MODES](dialog/FAILURE_MODES.md).

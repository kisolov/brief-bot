# brief-bot

Telegram-бот веб-студии и визуальный редактор сценария.

## Стек

- Backend: Python 3.13, uv, aiogram, FastAPI, dependency-injector, asyncpg, redis, pydantic-settings.
- Frontend: Nuxt 4 / Vue, Pinia.
- Инфраструктура: postgres 17 (хост 55432), redis 7 (хост 56379), `docker-compose.yml`.

## Команды

Из каталога `backend`:

- `uv run pytest` — все тесты; `uv run pytest -m "not integration"` — без postgres и redis.
- `uv run ruff check .` — линтер.
- `docker compose up -d` (из корня) — postgres и redis.

Хуки: `git config core.hooksPath .githooks`. `pre-commit` запускает ruff и pytest без integration, `commit-msg` отклоняет сообщения с `Co-Authored-By` и `Claude`.

## Политика git

- Remote нет, push не делается.
- Ветка закрывается локальным merge в основную ветку.
- В коммитах нет соавтора: ни `Co-Authored-By`, ни упоминаний Claude, Anthropic, ИИ.
- `--no-verify` не используется.

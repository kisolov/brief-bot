# Редактор: архитектура фронтенда

Каталог [editor](../../editor): Nuxt 4, `ssr: false`, Pinia, Vue Flow 1.48.2, раскладка dagre. Бэкенд описан в [API.md](../services/API.md). Экраны нарисованы в [design/shared/project](../../design/shared/project), имена компонентов совпадают с артбордами.

Цепочка вызовов: страница или компонент → композабл → store → порт репозитория ← адаптер. Композабл без состояния идёт в `container` напрямую (вход по ссылке).

## Домены

| Домен | Что делает | Описание |
|---|---|---|
| scenario | черновик, версии, схема | [scenario](scenario/ARCHITECTURE.md) |
| auth | обмен токена из ссылки бота на cookie | [auth](auth/ARCHITECTURE.md) |

Не сделано и появится в следующих задачах: заявки, настройки, версии. Ссылки "Заявки", "Настройки", "Версии" в шапке ведут на ещё не существующие страницы.

## Общие слои

| Слой | Файл | Роль |
|---|---|---|
| container | [container.ts](../../editor/app/container.ts) | единственное место, где порт связывается с адаптером; `__setContainer` только для тестов |
| HTTP-разбор | [adapters/http.ts](../../editor/app/repositories/adapters/http.ts) | `request()`: 401 это `SessionExpired`, остальное адаптер переводит сам, прочее `BackendUnavailable` |
| Ошибки | [errors/](../../editor/app/errors) | `base.ts` (общие), `auth.ts`, `scenario.ts`; текст для человека только в [presentation.ts](../../editor/app/errors/presentation.ts) |
| Токены дизайна | [tokens.css](../../editor/app/assets/css/tokens.css) | цвета, шрифт, размеры, снятые с артбордов |
| Каркас | [app.vue](../../editor/app/app.vue), [layouts/default.vue](../../editor/app/layouts/default.vue) | шапка и область страницы; в каркасе живут автосохранение и публикация, шапка показывает их состояние; страница входа без раскладки |

## Запуск и сборка

| Команда | Что даёт |
|---|---|
| `npx nuxt dev` | локально, `/api` проксируется на `http://localhost:8000/api` (`nitro.devProxy` в [nuxt.config.ts](../../editor/nuxt.config.ts)) |
| `NUXT_PUBLIC_EDITOR_MOCK=1 npx nuxt dev` | то же, но адаптеры-моки с сидом backend, backend не нужен |
| `npx nuxt build` / `npx nuxt generate` | рабочая сборка; `generate` кладёт статику в `.output/public` для раздачи с сервера. Мок и сид в неё не попадают |
| `EDITOR_API_TARGET=http://localhost:8100 npx nuxt dev` | `/api` идёт на другой порт backend, когда 8000 занят |
| `npx vitest run` | тесты; прогоняются pre-commit-хуком, если в коммит попали файлы `editor/` |

Сквозная проверка правки и публикации на настоящем backend ([publish.mjs](../../editor/tests/e2e/publish.mjs)):

```
docker compose up -d postgres redis
# backend из каталога backend; 8100, если 8000 занят
TELEGRAM_POLLING_ENABLED=false TELEGRAM_TOKEN=123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA TELEGRAM_MANAGER_CHAT_ID=1 \
  TELEGRAM_INVITE_CODE=dev EDITOR_BASE_URL=http://127.0.0.1:3300 \
  uv run uvicorn src.bootstrap.app:create_app --factory --port 8100
# редактор из каталога editor
EDITOR_API_TARGET=http://localhost:8100 npx nuxt dev --port 3300 --host 127.0.0.1
# сама проверка из каталога editor; те же переменные backend нужны, чтобы получить ссылку входа
E2E_EDITOR_URL=http://127.0.0.1:3300 E2E_PLAYWRIGHT_FROM=<package.json с playwright-core> node tests/e2e/publish.mjs
```

Ссылку входа печатает [dev_editor_link.py](../../backend/scripts/dev_editor_link.py) (`uv run python -m scripts.dev_editor_link` из `backend`): скрипт выдаёт её тестовому администратору через `IssueEditorLink`, приложение его не импортирует. Проверка меняет текст шага, публикует, убирает переход, видит панель ошибок и прежнюю версию, добавляет и удаляет шаг палитрой и броском; в конце версия 1 снова активна и черновик равен ей. Снимки кладутся в `E2E_SHOT_DIR`.

`/api` в рабочей сборке проксирует веб-сервер, самого прокси в статике нет.

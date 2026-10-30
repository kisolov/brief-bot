# Редактор: архитектура фронтенда

Каталог [editor](../../editor): Nuxt 4, `ssr: false`, Pinia, Vue Flow 1.48.2, раскладка dagre. Бэкенд описан в [API.md](../services/API.md). Экраны нарисованы в [design/shared/project](../../design/shared/project), имена компонентов совпадают с артбордами.

Цепочка вызовов: страница или компонент → композабл → store → порт репозитория ← адаптер. Композабл без состояния идёт в `container` напрямую (вход по ссылке).

## Домены

| Домен | Что делает | Описание |
|---|---|---|
| scenario | черновик, версии, схема | [scenario](scenario/ARCHITECTURE.md) |
| auth | обмен токена из ссылки бота на cookie | [auth](auth/ARCHITECTURE.md) |

Не сделано и появится в следующих задачах: панель шага, палитра, ошибки публикации, заявки, настройки, версии. Кнопка "Опубликовать" в шапке выключена до панели ошибок, ссылки "Заявки", "Настройки", "Версии" ведут на ещё не существующие страницы.

## Общие слои

| Слой | Файл | Роль |
|---|---|---|
| container | [container.ts](../../editor/app/container.ts) | единственное место, где порт связывается с адаптером; `__setContainer` только для тестов |
| HTTP-разбор | [adapters/http.ts](../../editor/app/repositories/adapters/http.ts) | `request()`: 401 это `SessionExpired`, остальное адаптер переводит сам, прочее `BackendUnavailable` |
| Ошибки | [errors/](../../editor/app/errors) | `base.ts` (общие), `auth.ts`, `scenario.ts`; текст для человека только в [presentation.ts](../../editor/app/errors/presentation.ts) |
| Токены дизайна | [tokens.css](../../editor/app/assets/css/tokens.css) | цвета, шрифт, размеры, снятые с артбордов |
| Каркас | [app.vue](../../editor/app/app.vue), [layouts/default.vue](../../editor/app/layouts/default.vue) | шапка и область страницы; страница входа без раскладки |

## Запуск и сборка

| Команда | Что даёт |
|---|---|
| `npx nuxt dev` | локально, `/api` проксируется на `http://localhost:8000/api` (`nitro.devProxy` в [nuxt.config.ts](../../editor/nuxt.config.ts)) |
| `NUXT_PUBLIC_EDITOR_MOCK=1 npx nuxt dev` | то же, но адаптеры-моки с сидом backend, backend не нужен |
| `npx nuxt build` / `npx nuxt generate` | рабочая сборка; `generate` кладёт статику в `.output/public` для раздачи с сервера. Мок и сид в неё не попадают |
| `npx vitest run` | тесты; прогоняются pre-commit-хуком, если в коммит попали файлы `editor/` |

`/api` в рабочей сборке проксирует веб-сервер, самого прокси в статике нет.

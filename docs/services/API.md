# HTTP API редактора

Код: [endpoints](../../backend/src/bootstrap/endpoints). Все пути под `/api`, кроме `GET /health`. Все пути, кроме `POST /api/auth/exchange`, требуют cookie `editor_session` (зависимость [require_session](../../backend/src/bootstrap/utils/session.py)); нет или просрочена: 401. Тела и ответы в camelCase. `/docs`, `/redoc`, `/openapi.json` выключены; схема доступна только через `app.openapi()`.

## Ошибки

Единое место: [exception_handlers.py](../../backend/src/bootstrap/utils/exception_handlers.py).

| Исключение | Статус | Тело |
|---|---|---|
| `DraftConflict` | 409 | `{detail}` |
| `ScenarioInvalid` | 422 | `{issues: [{code, stepId, optionId, message}]}` |
| `NotFound` | 404 | `{detail}` |
| `InvalidEditorToken` | 401 | `{detail}` |
| `NotAdmin` | 403 | `{detail}` |
| `FileTooLarge` | 413 | `{detail}` |
| ошибка валидации тела или параметра | 422 | стандартное тело FastAPI `{detail: [...]}` |

## Эндпойнты

| Метод и путь | Тело | Ответ |
|---|---|---|
| `POST /api/auth/exchange` | `{token}` | 204 и `Set-Cookie: editor_session=...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`; негодная ссылка 401 |
| `GET /api/scenario/draft` | | `{data, revision}`; `data` это сырой JSON черновика, может быть невалидным |
| `PUT /api/scenario/draft` | `{data, revision}` | `{revision}` новая; 409, если `revision` устарел |
| `POST /api/scenario/publish` | | `{version}`; невалидный сценарий 422 `{issues}`, версия бота не меняется |
| `GET /api/scenario/versions` | | `[{number, publishedAt, active}]` по возрастанию номера |
| `POST /api/scenario/versions/{n}/activate` | | 204; нет версии 404; черновик становится копией версии |
| `GET /api/leads?status=` | | `[Lead]`, новые первыми; `status` это `partial` или `full`, без параметра все; иное значение 422 |
| `GET /api/leads/{id}` | | `Lead`; нет заявки 404 |
| `GET /api/leads/{id}/file` | | `application/octet-stream`, `Content-Disposition: attachment; filename="tz-<id><суффикс>"`, суффикс из имени файла в Telegram, только `[a-zA-Z0-9.]` до 10 символов, иначе пустой; нет файла 404; больше 20 МБ 413 |
| `GET /api/settings/reminder` | | `{hours, text}` |
| `PUT /api/settings/reminder` | `{hours, text}` | `{hours, text}`; `hours` целое 1..168, `text` 1..1024 символа, иначе 422 |

`Lead`: `{id, branch, username, status, createdAt, lastStep, hasFile, answers: [{key, value}]}`. `key` подписан через `display_key`. Поля `chatId` и `fileId` нет. Менеджерский чат нигде в API не фигурирует.

## Связка с ботом

Ссылка для входа приходит командой `/editor` в Telegram: `<EDITOR_BASE_URL>/login?token=...`. Страница `/login` редактора берёт `token` и вызывает `POST /api/auth/exchange`. Подробности: [access](access/ARCHITECTURE.md).

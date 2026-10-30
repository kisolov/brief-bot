# access

Кто может войти в редактор: администраторы, одноразовые ссылки из бота и сессии редактора. Домен не знает про остальные домены; время ему передаёт вызывающая сторона.

## Сущности

Файл: [entities.py](../../../backend/src/access/entities.py).

| Сущность | Смысл |
|---|---|
| `TokenKind` | `link` (одноразовая ссылка, 10 минут) и `session` (cookie, 24 часа) |

Администратор это просто `telegram_id`, отдельной сущности нет.

## Порты и адаптеры

Файл портов: [ports.py](../../../backend/src/access/ports.py).

| Порт | Адаптер | За чем стоит |
|---|---|---|
| `AdminRepository` (`exists`, `add`) | [AsyncpgAdminRepository](../../../backend/src/access/adapters/asyncpg.py) | таблица `admins`; `add` через `ON CONFLICT DO NOTHING` |
| `AdminRepository` | [InMemoryAdminRepository](../../../backend/src/access/adapters/memory.py) | тесты |
| `TokenRepository` (`add`, `consume_link`, `session_valid`) | [AsyncpgTokenRepository](../../../backend/src/access/adapters/asyncpg.py) | таблица `editor_tokens`, только SHA-256 токена |
| `TokenRepository` | [InMemoryTokenRepository](../../../backend/src/access/adapters/memory.py) | тесты; свойство `hashes` для проверки, что токены не хранятся |

## Сервис

[AccessService](../../../backend/src/access/services.py):

| Метод | Смысл |
|---|---|
| `is_admin(telegram_id)`, `add_admin(telegram_id)` | администраторы |
| `issue_link(now) -> str` | новый токен `secrets.token_urlsafe(32)`, в хранилище хеш с `expires_at = now + 10 минут` |
| `exchange(token, now) -> str` | гасит ссылку атомарно и выдаёт токен сессии на 24 часа; негодная ссылка это `InvalidEditorToken` |
| `check_session(token, now)` | `InvalidEditorToken`, если сессии нет, она просрочена или токен другого вида |

## Usecase

| Usecase | Смысл |
|---|---|
| [IssueEditorLink](../../../backend/src/access/usecases/issue_editor_link.py) `(telegram_id, code) -> str` | администратору выдаёт `<EDITOR_BASE_URL>/login?token=...`; не администратор с верным кодом приглашения сначала становится администратором; иначе `NotAdmin` |
| [ExchangeToken](../../../backend/src/access/usecases/exchange_token.py) `(token) -> str` | ссылка в токен сессии |
| [CheckEditorSession](../../../backend/src/access/usecases/check_editor_session.py) `(token)` | проверка cookie на каждом запросе API |

Часы приходят в usecase как `clock` из контейнера. `base_url` и код приглашения usecase получает значениями (`EditorSettings.base_url`, `TelegramSettings.invite_code`), сам настроек не читает.

Вход: команда `/editor [код]` в [router.py](../../../backend/src/bootstrap/telegram/router.py) и `POST /api/auth/exchange` ([API.md](../API.md)).

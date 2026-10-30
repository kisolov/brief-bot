# auth: архитектура

Вход по одноразовой ссылке из бота (`/editor`). Серверная часть: [access](../../services/access/ARCHITECTURE.md), контракт: [API.md](../../services/API.md).

| Слой | Файл | Роль |
|---|---|---|
| Порт | [auth.port.ts](../../../editor/app/repositories/auth.port.ts) | `exchange(token)` |
| Адаптер | [auth.http.ts](../../../editor/app/repositories/adapters/auth.http.ts) | `POST /api/auth/exchange`, 204 и cookie `editor_session`; 401 здесь значит негодную ссылку, `InvalidLoginLink` |
| Мок | [auth.mock.ts](../../../editor/app/repositories/adapters/auth.mock.ts) | принимает любой непустой токен |
| Композабл | [useExchangeToken](../../../editor/app/composables/useExchangeToken.ts) | читает `token` из адреса, меняет на cookie, ведёт на `/`; возвращает текст ошибки или `null`. Store не нужен, идёт в `container` напрямую |
| Страница | [login.vue](../../../editor/app/pages/login.vue) | вызывает композабл при открытии, показывает текст |

Текст при любой неудаче (нет токена, негодная ссылка, сбой): "Откройте редактор командой /editor в боте." Только недоступный сервер отвечает "Сервер не отвечает. Попробуйте позже."; тексты в [presentation.ts](../../../editor/app/errors/presentation.ts).

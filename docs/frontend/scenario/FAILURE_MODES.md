# scenario: сбои

Общий разбор в [http.ts](../../../editor/app/repositories/adapters/http.ts): сначала доменная ошибка, потом статус, 401 это всегда `SessionExpired`, иной нераспознанный сбой (сеть, 5xx, таймаут) это `BackendUnavailable`. Повторов и деградации нет.

| Вызов `HttpScenarioRepository` | 401 | Другой статус | Что делает композабл |
|---|---|---|---|
| `getDraft`, `getVersions` | `SessionExpired` | `BackendUnavailable` | [useLoadScenario](../../../editor/app/composables/useLoadScenario.ts): 401 ведёт на `/login`, иное показывает текст над схемой: "Сервер не отвечает. Попробуйте позже." |
| `saveDraft` | `SessionExpired` | 409 `DraftConflict`, иное `BackendUnavailable` | вызова из UI пока нет |
| `publish` | `SessionExpired` | 422 `ScenarioInvalid` с `issues` из тела, иное `BackendUnavailable` | вызова из UI пока нет |
| `activate(n)` | `SessionExpired` | 404 `VersionNotFound`, иное `BackendUnavailable` | вызова из UI пока нет |

Черновик может быть невалидным: store при загрузке подставляет пустые `entry`, `blocks`, `steps`, если их нет, экран не падает. Если `getVersions` упал при загрузке, не загрузится и черновик: `load` ждёт обе операции.

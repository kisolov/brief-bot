# scenario: архитектура

Черновик сценария, версии бота и схема-граф. Формат JSON: [parser.py](../../../backend/src/scenario/parser.py), [описание на стороне backend](../../services/scenario/ARCHITECTURE.md).

## Типы

[types/scenario.ts](../../../editor/app/types/scenario.ts) зеркалит JSON: `Scenario` (`entry`, `blocks`, `steps`), `Step` (`type, text, key, options, next, when, no_back, validate, done_label, pos, finish, back_to`), `Option` (`id, label, next, input, exclusive, when, url`), `When`, `Target` (id шага, `{call, then}` или `"@return"`). У шага, кнопки и сценария есть индексная сигнатура: незнакомые поля живут в объектах как есть. `Draft`, `Issue`, `VersionInfo` описывают ответы API. `NEXT_HANDLE` (`:next`) это идентификатор выхода самого шага, у кнопок выход называется id кнопки.

## Порт, адаптеры, эндпойнты

| Метод порта | `HttpScenarioRepository` | Мок |
|---|---|---|
| `getDraft()` | `GET /api/scenario/draft` | сид backend |
| `saveDraft(data, revision)` | `PUT /api/scenario/draft`, возвращает новую ревизию | ревизия растёт |
| `publish()` | `POST /api/scenario/publish`, возвращает версию | новая активная версия |
| `getVersions()` | `GET /api/scenario/versions` | одна версия 1 |
| `activate(n)` | `POST /api/scenario/versions/{n}/activate`, 204 | переключает `active` |

Файлы: [порт](../../../editor/app/repositories/scenario.port.ts), [http](../../../editor/app/repositories/adapters/scenario.http.ts), [мок](../../../editor/app/repositories/adapters/scenario.mock.ts). Ошибки: `DraftConflict` (409), `ScenarioInvalid(issues)` (422), `VersionNotFound` (404), `SessionExpired` (401).

## Store

[scenario.store.ts](../../../editor/app/stores/scenario.store.ts): `steps`, `entry`, `blocks`, `selectedId`, `revision`, `issues`, `activeVersion`, `scenario` (сборка для схемы). Действия: `load`, `select`, `updateStep`, `addStep`, `removeStep`, `connect`, `setIssues`, `toDraftData` (данные для `saveDraft`). В этой версии экран только читает и выбирает; правящие действия покрыты тестами, но UI их не вызывает.

## Композаблы

| Композабл | Сценарий | Кто зовёт |
|---|---|---|
| [useLoadScenario](../../../editor/app/composables/useLoadScenario.ts) | открыть редактор: загрузить черновик, 401 ведёт на `/login`, иное возвращает текст ошибки | [index.vue](../../../editor/app/pages/index.vue) |
| [useScenarioLayout](../../../editor/app/composables/useScenarioLayout.ts) | вкладка графа, раскладка, выбор ноды, "Разложить" | [index.vue](../../../editor/app/pages/index.vue) |

## Схема

| Файл | Роль |
|---|---|
| [utils/scenarioGraph.ts](../../../editor/app/utils/scenarioGraph.ts) | `viewTabs`, `toFlow(сценарий, вид)`: чистая функция, шаги и переходы в ноды и рёбра |
| [utils/scenarioLayout.ts](../../../editor/app/utils/scenarioLayout.ts) | `autoLayout`: dagre `LR`, без `all` не трогает шаги с `pos` |
| [AppHeader](../../../editor/app/components/AppHeader.vue), [GraphTabs](../../../editor/app/components/GraphTabs.vue), [StepNode](../../../editor/app/components/StepNode.vue), [BlockNode](../../../editor/app/components/BlockNode.vue), [ScenarioGraph](../../../editor/app/components/ScenarioGraph.vue) | одноимённые артборды [макета](../../../design/shared/project); `BlockNode` рисует и вход в общий блок (тёмный), и заглушку-ссылку (светлый) |

Ноды Vue Flow: `step`, `block` (вход в общий блок), `stub` (заглушка). Подписи типов шагов и блоков заданы в `scenarioGraph.ts`: "Один выбор", "Несколько ответов", "Несколько + поле", "Текст", "Файл", "Сообщение"; блоки "Разделы сайта", "Сфера деятельности", "Финальные вопросы", "Примеры сайтов" (прочие по имени).

Миникарта и зум из `@vue-flow`; панель зума и кнопка "Разложить" свои, по артборду `ScenarioGraph`.

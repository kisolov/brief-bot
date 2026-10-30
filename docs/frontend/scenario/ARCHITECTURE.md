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

[scenario.store.ts](../../../editor/app/stores/scenario.store.ts): `steps`, `entry`, `blocks`, `selectedId`, `revision`, `issues`, `activeVersion`, `versions` (список версий для страницы "Версии" и бейджа), `draftMatchesActive`, `needsRollbackConfirm`, `scenario` (сборка для схемы), `homes` (вид, где создан ещё не подключённый шаг), состояние сохранения (`edits`, `dirty`, `saving`, `savedAt`, `saveFailed`, `conflict`), `publishing`, `notice`.

Действия правки, все неизменяемые: `updateStep`, `changeStepType`, `clearPositions`, `addStep`, `removeStep`, `addOption`, `updateOption`, `removeOption`, `connect` (без цели снимает переход). Каждая принятая правка увеличивает `edits`; при `conflict` правки не принимаются. Остальное: `load`, `loadVersions` (список и бейдж без загрузки схемы), `activate(n)` (откат), `select`, `setIssues`, `setNotice`, `blocksStartingAt`, `toDraftData`, `flush` (очередь сохранений), `publish` (дожать черновик, опубликовать, при 422 положить `issues`).

## Композаблы

| Композабл | Сценарий | Кто зовёт |
|---|---|---|
| [useLoadScenario](../../../editor/app/composables/useLoadScenario.ts) | открыть редактор: загрузить черновик, 401 ведёт на `/login`, иное возвращает текст ошибки | [index.vue](../../../editor/app/pages/index.vue) |
| [useScenarioLayout](../../../editor/app/composables/useScenarioLayout.ts) | вкладка графа, раскладка, выбор ноды, "Разложить" (очищает `pos` шагов вида), пометки ошибок на нодах, переход по ошибке (`jumpTo`) | index.vue |
| [useEditStep](../../../editor/app/composables/useEditStep.ts) | править шаг: поля, подпись ответа (`setKey`), смена типа (`changeType`), кнопки, условие показа (`setAnswer`), позиция, удаление шага (начальный нельзя, шаг-начало блока с подтверждением) | [StepPanel](../../../editor/app/components/StepPanel.vue), index.vue |
| [useAddStep](../../../editor/app/composables/useAddStep.ts) | добавить шаг: из палитры (в видимой части или в месте броска) или как цель кнопки "Новый шаг…" | [StepPanel](../../../editor/app/components/StepPanel.vue), index.vue |
| [useConnectSteps](../../../editor/app/composables/useConnectSteps.ts) | соединить шаги: стрелка на схеме и список "Куда ведёт" пишут один переход | StepPanel, index.vue |
| [useAutosaveDraft](../../../editor/app/composables/useAutosaveDraft.ts) | сохранять черновик через 800 мс тишины; отдаёт текст статуса для шапки | [layouts/default.vue](../../../editor/app/layouts/default.vue) |
| [usePublishScenario](../../../editor/app/composables/usePublishScenario.ts) | опубликовать: `store.publish`, ошибки сценария остаются в store, сбой сети становится `notice` | layouts/default.vue |
| [useLoadVersions](../../../editor/app/composables/useLoadVersions.ts) | загрузить версии для бейджа и страницы, схема не нужна | layouts/default.vue, [versions.vue](../../../editor/app/pages/versions.vue) |
| [useActivateVersion](../../../editor/app/composables/useActivateVersion.ts) | вернуть версию: при правках или расхождении с активной версией `confirm("Черновик будет заменён версией N. Продолжить?")`, затем `store.activate(n)` | versions.vue |

## Схема

| Файл | Роль |
|---|---|
| [utils/scenarioGraph.ts](../../../editor/app/utils/scenarioGraph.ts) | `viewTabs`, `toFlow(сценарий, вид, homes)`: чистая функция, шаги и переходы в ноды и рёбра; `viewOfStep`, `stepIdsOf` |
| [utils/stepTargets.ts](../../../editor/app/utils/stepTargets.ts) | пункты списка "Куда ведёт": шаги по первой строке текста, "Перейти в блок: ...", внутри блока "Вернуться из блока"; кодирование цели в значение списка |
| [utils/stepKeys.ts](../../../editor/app/utils/stepKeys.ts) | подписи ответа: занятые ботом (`name`, `Направление`), `keyInfo` (блокировка, подпись для человека, использование в текстах, дубль) |
| [utils/stepType.ts](../../../editor/app/utils/stepType.ts) | `convertStep`: шаг после смены типа и число потерянных кнопок и переходов |
| [utils/issues.ts](../../../editor/app/utils/issues.ts) | `issueItems` (строки панели ошибок с номерами), `locateIssue` (вкладка и шаг для клика), `errorNumbers` (номера на нодах) |
| [utils/scenarioLayout.ts](../../../editor/app/utils/scenarioLayout.ts) | `autoLayout`: dagre `LR`, без `all` не трогает шаги с `pos` |
| [AppHeader](../../../editor/app/components/AppHeader.vue), [GraphTabs](../../../editor/app/components/GraphTabs.vue), [StepNode](../../../editor/app/components/StepNode.vue), [BlockNode](../../../editor/app/components/BlockNode.vue), [ScenarioGraph](../../../editor/app/components/ScenarioGraph.vue), [StepPalette](../../../editor/app/components/StepPalette.vue), [StepPanel](../../../editor/app/components/StepPanel.vue), [ErrorsPanel](../../../editor/app/components/ErrorsPanel.vue) | одноимённые артборды [макета](../../../design/shared/project); `BlockNode` рисует и вход в общий блок (тёмный), и заглушку-ссылку (светлый) |

Ноды Vue Flow: `step`, `block` (вход в общий блок), `stub` (заглушка). Подписи типов шагов и блоков заданы в `scenarioGraph.ts`: "Один выбор", "Несколько ответов", "Несколько + поле", "Текст", "Файл", "Сообщение"; блоки "Разделы сайта", "Сфера деятельности", "Финальные вопросы", "Примеры сайтов" (прочие по имени).

Миникарта и зум из `@vue-flow`; панель зума и кнопка "Разложить" свои, по артборду `ScenarioGraph`.

## Правка на экране

Экран [index.vue](../../../editor/app/pages/index.vue): слева палитра шагов (клик добавляет шаг в видимой части, бросок на схему создаёт его в месте броска), по центру схема, справа `StepPanel` при выбранном шаге либо `ErrorsPanel`, если шага нет, а ошибки публикации есть.

`StepPanel` поля: тип шага; "Текст сообщения"; "Как подписать ответ в заявке" (`key`, кроме типа "Сообщение"); у текстового шага "Проверять ответ" (не проверять, как телефон, как ссылку); кнопки с подписью и счётчиком до 40 знаков; "Куда ведёт" кнопки (только у выбора, сообщения и завершающего шага: никуда, ссылка на сайт, шаг, блок с выбором шага возврата, новый шаг); у "Несколько ответов" и "Несколько + поле" вместо "Куда ведёт" флажки "Человек вводит свой текст" (`input`) и "Снимает другие отметки" (`exclusive`); "Куда идти дальше" шага (`next`); "Завершить анкету на этом шаге" (`finish`) и "Куда ведёт «Назад» после завершения" (`back_to`); "Когда показывать" (`when`): вопрос, "Показывать, если отмечено" (`any`) и "И не отмечено" (`none`); "Удалить шаг". Id шагов и кнопок на экране не показываются.

Шапка показывает статус черновика, "В боте: версия N" и кнопку "Опубликовать".

## Версии

Страница [versions.vue](../../../editor/app/pages/versions.vue) и [VersionsList](../../../editor/app/components/VersionsList.vue) (артборд `VersionsList`): новые версии сверху, у активной "Сейчас в боте", у прочих "Вернуть". Откат на backend делает черновик копией версии. `store.activate(n)`: дожидается сохранения в полёте, зовёт `activate`, затем `load()` (черновик, список версий, шапка "В боте: версия N" берутся заново). `draftMatchesActive` истинно после публикации и после отката и сбрасывается первой же правкой и каждой загрузкой: API не отдаёт содержимое версии, поэтому после перезагрузки страницы расхождение считается возможным и подтверждение спрашивается. Список версий мок хранит вместе с содержимым: `activate` в моке заменяет черновик.

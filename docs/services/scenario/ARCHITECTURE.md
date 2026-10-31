# scenario

Сценарий анкеты как данные: шаги, кнопки, переходы, условия. Хранится JSON-ом в postgres, в памяти разбирается в неизменяемые сущности. Движок диалога читает только сущности ([dialog](../dialog/ARCHITECTURE.md)).

## Сущности

Файл: [entities.py](../../../backend/src/scenario/entities.py).

| Сущность | Смысл |
|---|---|
| `Scenario` | `version`, `entry` (первый шаг), `blocks` (имя блока → id первого шага), `steps` (id → `Step`) |
| `Step` | Один экран: `type`, `text`, `key` (под каким именем ответ попадёт в заявку), `options`, `next`, `when`, `no_back`, `validate`, `done_label`, `finish`, `back_to`, `pos` |
| `StepType` | `choice` (одна кнопка), `multi` (отметки и "Готово"), `multi_input` (отметки, у части опций вопрос текстом), `text`, `file`, `info` |
| `Option` | Кнопка: `id`, `label`, `next`, `input` (вопрос текстом после отметки), `exclusive`, `when`, `url` (кнопка-ссылка, без перехода) |
| `Call` | Переход "войти в блок": `block` и `then` (куда вернуться по `@return`) |
| `When` | Условие показа: `step`, `any`, `none` |
| `Draft` | Черновик редактора: сырой `data: dict` и `revision` |
| `VersionInfo` | Строка списка версий: `number`, `published_at`, `active` |

`Target = str | Call`. Строка это id шага либо константа `@return` (вернуться на шаг со стека возвратов).

### Особые поля шага

| Поле | Что делает |
|---|---|
| `finish` | Единственный признак конца анкеты: вход в шаг завершает её, кнопки остаются видны, кнопка начинает новый проход. Запрещён у `text` и `file` |
| `back_to` | Только для `finish`-шага: на какой шаг ведёт "Назад" на первом шаге нового прохода |
| `no_back` | Движок не показывает "Назад" на шаге |
| `validate` | `phone` или `url`, проверка текстового ответа |
| `done_label` | Подпись кнопки "Готово" / "Продолжить" |
| `pos` | Координаты ноды в редакторе, движок не читает |

### Условие `When`

Выполнено, если ответ на шаг `step` содержит хотя бы один id из `any` и ни одного из `none`. Нет ответа на шаг: не выполнено. `none` по умолчанию пустой: условие без исключений.

- На шаге: шаг с невыполненным `when` пропускается, переход идёт по его `next`.
- На опции: опция скрыта и не нажимается.

## Файлы

| Файл | Роль |
|---|---|
| [parser.py](../../../backend/src/scenario/parser.py) | `parse_scenario(data, version)` JSON в `Scenario`, `dump_scenario` обратно. Ошибка формы: `ScenarioMalformed` |
| [validator.py](../../../backend/src/scenario/validator.py) | `validate_scenario(s)` возвращает `list[Issue]`, тексты написаны для заказчика |
| [when_check.py](../../../backend/src/scenario/when_check.py) | `check_conditions(s)`: проверка условий показа шагов и кнопок, вызывается из `validate_scenario` |
| [seed/](../../../backend/src/scenario/seed/__init__.py) | `load_seed()`: начальный сценарий из ТЗ ([scenario.json](../../../backend/src/scenario/seed/scenario.json)), версия 1 |
| [ports.py](../../../backend/src/scenario/ports.py) | `ScenarioRepository` |
| [services.py](../../../backend/src/scenario/services.py) | `ScenarioService` |
| [exceptions.py](../../../backend/src/scenario/exceptions.py) | `ScenarioMalformed`, `DraftConflict`, `ScenarioInvalid(issues)` |

`dump_scenario` пишет только непустые поля: в результате нет `no_back: false`, пустых `options` и т.п.

## Порт и адаптеры

| Адаптер | Хранит |
|---|---|
| [AsyncpgScenarioRepository](../../../backend/src/scenario/adapters/asyncpg.py) | `scenario_versions` (номер, jsonb, `published_at`, `active`) и `scenario_draft` (одна строка `id = 1`: jsonb, `revision`) |
| [InMemoryScenarioRepository](../../../backend/src/scenario/adapters/memory.py) | то же в словаре; для тестов |

Методы порта: [ports.py](../../../backend/src/scenario/ports.py). Сверх интерфейса плана вместо `set_active` есть `activate_version` (атомарный откат) и `seed` (первый запуск).

## Сервис

`ScenarioService` ([services.py](../../../backend/src/scenario/services.py)); usecase: [EnsureSeeded](../../../backend/src/scenario/usecases/ensure_seeded.py) (вызывается из `lifespan` при старте и кладёт сид, если версий нет) и для редактора [GetDraft](../../../backend/src/scenario/usecases/get_draft.py), [SaveDraft](../../../backend/src/scenario/usecases/save_draft.py), [PublishScenario](../../../backend/src/scenario/usecases/publish_scenario.py), [ListVersions](../../../backend/src/scenario/usecases/list_versions.py), [ActivateVersion](../../../backend/src/scenario/usecases/activate_version.py): по одному вызову сервиса, `PublishScenario` и `ActivateVersion` пишут один `INFO` с номером версии. DTO: [schema.py](../../../backend/src/scenario/schema.py) (`DraftDto`, `SaveDraftDto`, `RevisionDto`, `PublishedDto`, `VersionDto`, `IssueDto`, все `CamelModel`; `data` черновика идёт как `dict`). HTTP-контракт: [API.md](../API.md).

| Метод | Делает |
|---|---|
| `current()` | активная версия как `Scenario` |
| `by_version(n)` | версия `n`, `NotFound` если нет |
| `draft()` | `Draft` |
| `save_draft(data, base_revision)` | сохраняет и возвращает новый `revision`; устарел `base_revision`: `DraftConflict` |
| `publish()` | проверяет черновик и записывает новой версией; возвращает номер |
| `rollback(n)` | `activate_version(n)`: версия `n` становится активной, черновик заменяется её данными, одной операцией |
| `versions()` | `list[VersionInfo]` по возрастанию номера |
| `ensure_seeded()` | при пустой таблице версий пишет сид версией 1 и черновиком; `True`, если записал. |

## Проверка сценария

Коды `Issue.code` ([validator.py](../../../backend/src/scenario/validator.py)):

| Код | Когда |
|---|---|
| `missing_target` | шаг, кнопка, `back_to`, `then` или блок ведут на несуществующий шаг; `entry` не существует |
| `unknown_block` | `Call` на блок, которого нет |
| `unreachable` | шаг недостижим от `entry` |
| `no_options` | `choice`, `multi`, `multi_input` без кнопок |
| `missing_next` | нет перехода там, где он нужен: у `text`, `file`, `multi`, `multi_input`, у любого шага с `when`, у `info` без `finish`, без `next` и без кнопки с переходом, у кнопки `choice`/`info`/`finish`-шага без `next` и без `url` (пустой `url` редактор хранит, пока человек не ввёл адрес, поэтому пустая строка не считается ссылкой). Плюс `@return` там, где стек возврата может быть пуст: `Call` без `then` на блок, из которого достижим `@return`, вне другого блока ("После блока бот не знает, куда идти. Выберите шаг возврата.") и прямой `@return` вне блока |
| `when_unknown_step` | условие ссылается на несуществующий шаг |
| `when_conflict` | один id и в `any`, и в `none` условия шага или кнопки ([when_check.py](../../../backend/src/scenario/when_check.py)) |
| `when_empty` | `any` условия пуст: условие не выполнится никогда |
| `when_unknown_answer` | id из `any` или `none` нет среди кнопок шага из `when.step` (либо у него нет кнопок) |
| `when_self` | `when.step` равен своему шагу, для шага и его кнопок |
| `when_not_before` | от `when.step` нет пути к шагу: ответа на вопрос к этому моменту не будет |
| `when_never` | неподвижная точка: ответы, нужные условию, сами недостижимы (каскад, первопричина с другим кодом не повторяется) |
| `when_option_conflict` | условие кнопки и условие её шага на один `choice` не пересекаются |
| `empty_text` | текст шага или запрос `input` у опции `multi_input` пуст после `strip` |
| `text_too_long` | текст шага или запрос `input` длиннее 4096 единиц UTF-16 |
| `empty_label` | подпись кнопки пуста после `strip` |
| `bad_url` | непустой `url` не начинается с `http://` или `https://` либо содержит пробел |
| `bad_finish` | `finish` у `text` или `file` |
| `input_on_multi` | `input` у опции типа `multi`: движок спрашивает текст только у `multi_input` |
| `missing_key` | у `text`, `file`, `multi`, `multi_input` нет подписи ответа; `choice` может быть навигацией, ему подпись не обязательна |
| `bad_id` | id шага или кнопки не `[a-z0-9_]{1,24}` |
| `label_too_long` | подпись кнопки длиннее 40 знаков |
| `callback_too_long` | `s:<step>:o:<option>` длиннее 64 байт |
| `malformed` | добавляет не валидатор, а `ScenarioService.publish()`: JSON черновика не разобрался, `step_id` пустой |

Для проблем блока `step_id` равен имени блока; редактор должен это учитывать.

Известные ограничения проверки (записаны как есть, не исправлены):

- Отсутствующий `entry` даёт `missing_target`, но следом все шаги получают `unreachable`.
- `bad_id` проверяет ключ словаря `steps`, а не `Step.id`.
- Достижимость не учитывает `back_to`.
- Проверка `@return` не учитывает `when`: блок считается возвращающим, даже если выход закрыт условием.
- Шаг только с кнопками-ссылками типа `choice` проверка не ловит: `next` у `choice` не работает, шаг требует кнопку с переходом вручную.
- Цикл из пропускаемых по `when` шагов не обнаруживается.

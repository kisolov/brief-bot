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
| `finish` | Конечный шаг с кнопками: вход в него завершает анкету, кнопки остаются видны, кнопка начинает новый проход |
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

`ScenarioService` ([services.py](../../../backend/src/scenario/services.py)); usecase один: [EnsureSeeded](../../../backend/src/scenario/usecases/ensure_seeded.py) (вызывается из `lifespan` при старте и кладёт сид, если версий нет). HTTP пока нет.

| Метод | Делает |
|---|---|
| `current()` | активная версия как `Scenario` |
| `by_version(n)` | версия `n`, `NotFound` если нет |
| `draft()` | `Draft` |
| `save_draft(data, base_revision)` | сохраняет и возвращает новый `revision`; устарел `base_revision`: `DraftConflict` |
| `publish()` | проверяет черновик и записывает новой версией; возвращает номер |
| `rollback(n)` | `activate_version(n)`: версия `n` становится активной, черновик заменяется её данными, одной операцией |
| `versions()` | `list[VersionInfo]` по возрастанию номера |
| `ensure_seeded()` | при пустой таблице версий пишет сид версией 1 и черновиком; `True`, если записал. Из `lifespan` пока не вызывается |

## Проверка сценария

Коды `Issue.code` ([validator.py](../../../backend/src/scenario/validator.py)):

| Код | Когда |
|---|---|
| `missing_target` | шаг, кнопка, `back_to`, `then` или блок ведут на несуществующий шаг; `entry` не существует |
| `unknown_block` | `Call` на блок, которого нет |
| `unreachable` | шаг недостижим от `entry` |
| `no_options` | `choice`, `multi`, `multi_input` без кнопок |
| `missing_next` | нет перехода там, где он нужен: у `text`, `file`, `multi`, `multi_input`, у любого шага с `when`, у кнопки `choice`/`info`/`finish`-шага без `next` и без `url` |
| `when_unknown_step` | условие ссылается на несуществующий шаг |
| `bad_id` | id шага или кнопки не `[a-z0-9_]{1,24}` |
| `label_too_long` | подпись кнопки длиннее 40 знаков |
| `callback_too_long` | `s:<step>:o:<option>` длиннее 64 байт |
| `malformed` | добавляет не валидатор, а `ScenarioService.publish()`: JSON черновика не разобрался, `step_id` пустой |

Для проблем блока `step_id` равен имени блока; редактор должен это учитывать.

Известные ограничения проверки (записаны как есть, не исправлены):

- Отсутствующий `entry` даёт `missing_target`, но следом все шаги получают `unreachable`.
- `bad_id` проверяет ключ словаря `steps`, а не `Step.id`.
- Достижимость не учитывает `back_to`.
- Цикл из пропускаемых по `when` шагов не обнаруживается.

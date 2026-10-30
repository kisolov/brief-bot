# dialog

Движок анкеты и хранение состояния диалога. Движок это чистые функции над `Scenario` и `Session` без ввода-вывода; Поверх него сервис, два usecase и сборка заявки; Telegram-слой лежит в [bootstrap](../ARCHITECTURE.md). Зависит от [scenario](../scenario/ARCHITECTURE.md) и [leads](../leads/ARCHITECTURE.md).

## Сущности

Файл: [entities.py](../../../backend/src/dialog/entities.py).

| Сущность | Смысл |
|---|---|
| `Event` | Что сделал человек: `kind` (`start`, `button`, `done`, `back`, `text`, `file`), `step` (на каком экране), `value` (id опции, текст или `file_id`) |
| `Session` | Состояние чата, см. ниже |
| `Answer` | Ответ на шаг: `labels` и `ids` выбранных опций, `texts`, `file_id`. Текст шага `text` лежит в `texts["value"]`, текст опции `multi_input` в `texts[option_id]` |
| `Screen` | Что показать: `step`, `text`, `buttons`, `can_done`, `can_back`, `expects` (`none`, `text`, `file`), `edit` (править прошлое сообщение), `done_label` |
| `Button` | `id`, `label`, `checked`, `url` |
| `StepResult` | Новая `Session`, `Screen` и `effects` |
| `Effect` | `FINISHED` (анкета закончилась), `PROGRESS` (был содержательный ход) |

### Session

| Поле | Смысл |
|---|---|
| `chat_id`, `username` | чат и Telegram-аккаунт |
| `version` | версия сценария, на которой идёт проход (закреплена при создании сессии) |
| `step` | текущий шаг |
| `history` | пройденные шаги до текущего, последний элемент это предыдущий шаг |
| `history_returns` | снимки стека возврата, параллельны `history`: `history_returns[i]` это стек в момент, когда шаг `history[i]` был текущим |
| `history_answers` | снимки ключей `answers`, параллельны `history`: ключи на момент ухода с шага `history[i]`, включая его собственный ответ |
| `returns` | стек возврата из блоков: id шагов, на которые вернёмся по `@return` |
| `answers` | ответы по id шага |
| `pending_input` | id опции `multi_input`, текст которой сейчас ждём |
| `finished`, `reminded` | анкета закончена; напоминание уже отправлено |

Константа `BRANCH_KEY = "Направление"`: ключ шага главного меню, по нему заявка узнаёт направление.

## Движок

Файл: [engine.py](../../../backend/src/dialog/engine.py).

| Функция | Делает |
|---|---|
| `new_session(scenario, chat_id)` | сессия на `entry`; если `entry` терминальный, сразу `finished` |
| `step(scenario, session, event)` | применяет событие, возвращает `StepResult` |
| `render(scenario, session)` | экран текущего шага; "Назад" добавляет движок |

События и реакции:

| Событие | Реакция |
|---|---|
| `button` на `choice` | записывает ответ (подпись и id) и идёт по `option.next` |
| `button` на `multi`/`multi_input` | отмечает или снимает опцию; `exclusive` снимает остальные, а любая другая снимает `exclusive`; порядок отметок как в сценарии; для `multi_input` отмеченная опция с `input` включает `pending_input` |
| `button` на `info` с опциями | идёт по `option.next`, ответа не пишет |
| `button` с `url` | игнорируется (ссылку открывает Telegram) |
| `done` | `multi`/`multi_input`, а также `info` без опций со `next`: идёт по `step.next` |
| `text` | `text`-шаг: обрезает пробелы, проверяет `validate`, пишет `texts["value"]`, идёт по `next`. При `pending_input`: сохраняет текст опции |
| `file` | `file`-шаг: пишет `file_id`, идёт по `next` |
| `back` | см. [INVARIANTS](INVARIANTS.md) |
| `start` | показывает текущий экран, состояние не меняется |

Эффекты: `FINISHED`, когда вход в терминальный шаг или `@return` при пустом стеке закрыли анкету, или когда кнопка под финалом сразу привела в терминальный шаг; `PROGRESS` на остальных содержательных ходах. Событие, не изменившее состояния, возвращает прежний экран без эффектов.

## Порты и адаптеры

Файл портов: [ports.py](../../../backend/src/dialog/ports.py).

| Порт | Адаптеры | Что хранит |
|---|---|---|
| `SessionRepository` (`get`, `save`, `delete`) | [RedisSessionRepository](../../../backend/src/dialog/adapters/redis.py), [InMemorySessionRepository](../../../backend/src/dialog/adapters/memory.py) | Redis: JSON по ключу `session:<chat_id>`, TTL 30 дней, продлевается каждым `save` |
| `ReminderQueue` (`schedule`, `cancel`, `due`; `due` забирает записи) | [RedisReminderQueue](../../../backend/src/dialog/adapters/redis.py), [InMemoryReminderQueue](../../../backend/src/dialog/adapters/memory.py) | Redis: `ZSET reminders`, член `chat_id`, оценка это unix-время срабатывания |

Сериализатор сессии (`session_to_json`, `session_from_json`) лежит в [adapters/redis.py](../../../backend/src/dialog/adapters/redis.py) и не требует подключения к Redis.

## Сервис

[DialogService](../../../backend/src/dialog/services.py): единственная точка доступа usecase к `SessionRepository`, `ReminderQueue` и (через `ScenarioService.by_version`) к закреплённой версии сценария.

| Метод | Делает |
|---|---|
| `load(chat_id)`, `save(session)` | чтение и запись сессии |
| `start(chat_id, username)` | новая сессия на текущей опубликованной версии, сохраняется, возвращает экран входа |
| `apply(chat_id, event, username=None)` | событие к сохранённой сессии на её версии; обновляет `username`; **ничего не сохраняет**; нет сессии: `SessionNotFound` |
| `reset(chat_id, username=None)` | снимает напоминание и делает `start`; `username` берётся из старой сессии, если не передан |
| `screen(session)`, `scenario_of(session)` | экран и сценарий сессии |
| `schedule_reminder`, `cancel_reminder` | очередь напоминаний |

Экран возобновления: `resume_screen()` с маркером `RESUME_STEP = "@resume"`, кнопки `continue` "Продолжить" и `restart` "Начать заново", `can_back = False`. Для `Screen.step == "@resume"` клавиатура пакует кнопки как `r:continue` и `r:restart`.

## Usecase

| Класс | Делает |
|---|---|
| [HandleEvent](../../../backend/src/dialog/usecases/handle_event.py) `(chat_id, username, event) -> Screen` | единственный вход событий диалога, порядок решений в [INVARIANTS](INVARIANTS.md) |
| [ResumeOrRestart](../../../backend/src/dialog/usecases/resume_or_restart.py) `(chat_id, choice, username=None) -> Screen` | `continue` показывает текущий экран; `restart` и отсутствие сессии: новая сессия |

[build_lead](../../../backend/src/dialog/lead_builder.py)`(scenario, session, status, now) -> Lead`: чистая функция. `answers` в порядке записи, только с `key` и без `BRANCH_KEY`, значение через `answer_text`; `branch` это подпись последнего ответа с `BRANCH_KEY` (иначе пусто); `file_id` последнего ответа с файлом; `last_step` первая строка текста текущего шага до 100 символов. Пустые значения не пропускаются.

## Telegram (bootstrap)

Роутер превращает апдейт в `Event`: `/start` в `start`; нажатие в `button`/`done`/`back` по `callback_data`; текст в `text`; `document` и `photo` (наибольший размер) в `file` с `file_id`; сообщение без текста и файла в `text` с пустым значением (движок покажет экран заново).

`callback_data`: `s:<шаг>:o:<опция>`, `s:<шаг>:d`, `s:<шаг>:b`, `r:continue`, `r:restart`; не длиннее 53 байт при id до 24 символов. Чужие данные: `unpack` даёт `None`, роутер отвечает на callback и ничего не делает.

Клавиатура: опция по одной в ряд, ссылка это url-кнопка, отмеченная опция с префиксом `✅ ` (на `callback_data` не влияет), ряд `done_label` при `can_done`, ряд `⬅️ Назад` при `can_back`. Тексты уходят с `parse_mode=None`.


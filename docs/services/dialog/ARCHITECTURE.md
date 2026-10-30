# dialog

Движок анкеты и хранение состояния диалога. Движок это чистые функции над `Scenario` и `Session` без ввода-вывода; Telegram, usecase-слой и DI ещё не написаны. Зависит от [scenario](../scenario/ARCHITECTURE.md).

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
| `ReminderQueue` (`schedule`, `cancel`, `due`) | [RedisReminderQueue](../../../backend/src/dialog/adapters/redis.py), [InMemoryReminderQueue](../../../backend/src/dialog/adapters/memory.py) | Redis: `ZSET reminders`, член `chat_id`, оценка это unix-время срабатывания |

Сериализатор сессии (`session_to_json`, `session_from_json`) лежит в [adapters/redis.py](../../../backend/src/dialog/adapters/redis.py) и не требует подключения к Redis.

## Запланировано

Usecase-слой (`HandleEvent`, напоминания), Telegram-шлюз, DI-контейнер. В этом документе не описаны, пока не написаны.

# leads

Заявки: сохранение прохода анкеты (частичного или полного) и уведомление менеджера. Домен не знает про `dialog` и `scenario`: `Lead` собирает вызывающая сторона (`dialog`, Task 8), здесь сборки из `Session` нет. Usecase-слоя, DI и API пока нет.

## Сущности

Файл: [entities.py](../../../backend/src/leads/entities.py).

| Сущность | Смысл |
|---|---|
| `LeadStatus` | `partial` (анкета брошена) и `full` (дошли до финала) |
| `LeadAnswer` | `key` (имя из шага сценария) и `value` (текст ответа) |
| `Lead` | `id` (None до сохранения), `chat_id`, `username`, `branch` (направление), `answers` (кортеж в порядке прохождения), `status`, `file_id` (файл ТЗ), `created_at`, `last_step` (для partial) |

## Порты и адаптеры

Файл портов: [ports.py](../../../backend/src/leads/ports.py).

| Порт | Адаптер | За чем стоит |
|---|---|---|
| `LeadRepository` | [AsyncpgLeadRepository](../../../backend/src/leads/adapters/asyncpg.py) | postgres, таблица `leads` ([001_init.sql](../../../backend/migrations/001_init.sql)) |
| `LeadRepository` | [InMemoryLeadRepository](../../../backend/src/leads/adapters/memory.py) | тесты |
| `ManagerNotifier` | [MockManagerNotifier](../../../backend/src/leads/adapters/memory.py) | тесты (`fail=True` имитирует сбой) |
| `ManagerNotifier` | `TelegramManagerNotifier` (запланирован, Task 8, `adapters/telegram.py`) | менеджерский чат Telegram |

## Сервис и форматирование

| Что | Файл | Смысл |
|---|---|---|
| `LeadService` | [services.py](../../../backend/src/leads/services.py) | `save_partial`, `finish`: `upsert_open` с нужным статусом, затем уведомление; возвращают сохранённый `Lead`. `list(status)`, `get(id)` |
| `format_lead` | [formatter.py](../../../backend/src/leads/formatter.py) | `Lead` в список частей текста для Telegram, каждая до 4096 символов |
| `display_key` | [formatter.py](../../../backend/src/leads/formatter.py) | подпись ключа ответа для показа; единственное место, его же возьмёт схема API (Task 10) |

## Хранение

Таблица `leads`; `answers` это jsonb-список `[{"key", "value"}]`, а не объект: jsonb переупорядочивает ключи объекта, порядок ответов терялся бы. Пустой объект из значения по умолчанию колонки читается как «ответов нет».

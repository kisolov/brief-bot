# leads

Заявки: сохранение прохода анкеты (частичного или полного) и уведомление менеджера. Домен не знает про `dialog` и `scenario`: `Lead` собирает вызывающая сторона, сборки из `Session` здесь нет. `LeadService` вызывает `dialog`; для редактора есть три usecase и DTO, HTTP-контракт в [API.md](../API.md).

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
| `FileGateway` (`download(file_id) -> bytes`) | [TelegramFileGateway](../../../backend/src/leads/adapters/telegram.py) | `bot.get_file`, затем `download_file` в память. Файл больше 20 МБ (`file_size` или ответ `file is too big`) это `FileTooLarge`, скачивание не начинается |
| `FileGateway` | [MockFileGateway](../../../backend/src/leads/adapters/memory.py) | тесты: `files` по `file_id`, `errors` задаёт исключение |
| `ManagerNotifier` | [MockManagerNotifier](../../../backend/src/leads/adapters/memory.py) | тесты (`fail=True` имитирует сбой) |
| `ManagerNotifier` | [TelegramManagerNotifier](../../../backend/src/leads/adapters/telegram.py) | менеджерский чат Telegram (`TELEGRAM_MANAGER_CHAT_ID`): части текста по очереди через `send_message` без разметки, затем файл: `send_document`, при `TelegramBadRequest` `send_photo` (`file_id` фото документом не уйдёт) |

## Сервис и форматирование

| Что | Файл | Смысл |
|---|---|---|
| `LeadService` | [services.py](../../../backend/src/leads/services.py) | `save_partial`, `finish`: `upsert_open` с нужным статусом, затем уведомление; возвращают сохранённый `Lead`. `list(status)`, `get(id)`, `download_file(id) -> bytes` (`NotFound`, если заявки или файла нет; `FileTooLarge` от шлюза) |
| `format_lead` | [formatter.py](../../../backend/src/leads/formatter.py) | `Lead` в список частей текста для Telegram, каждая до 4096 символов |
| `display_key` | [formatter.py](../../../backend/src/leads/formatter.py) | подпись ключа ответа для показа; единственное место, его же берёт `LeadDto` |

## Usecase и DTO

| Что | Файл | Смысл |
|---|---|---|
| `ListLeads(status)`, `GetLead(id)`, `DownloadLeadFile(id)` | [usecases](../../../backend/src/leads/usecases) | по одному вызову `LeadService` |
| `LeadDto` | [schema.py](../../../backend/src/leads/schema.py) | `id`, `branch`, `username`, `status`, `createdAt`, `lastStep`, `hasFile`, `answers: [{key, value}]`; `key` через `display_key`, `chat_id` и `file_id` наружу не отдаются |

## Хранение

Таблица `leads`; `answers` это jsonb-список `[{"key", "value"}]`, а не объект: jsonb переупорядочивает ключи объекта, порядок ответов терялся бы. Пустой объект из значения по умолчанию колонки читается как «ответов нет».

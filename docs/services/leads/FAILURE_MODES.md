# leads: сбои зависимостей

Исходящий шлюз один: `ManagerNotifier`, боевой адаптер [TelegramManagerNotifier](../../../backend/src/leads/adapters/telegram.py).

| Сбой | Поведение | Где |
|---|---|---|
| `ManagerNotifier.send` бросает любое исключение (сеть, таймаут, 4xx/5xx Telegram, менеджер заблокировал бота) | Не пробрасывается. Заявка уже записана и остаётся в хранилище. `logger.error("Manager notification failed", exc_info=True)` с `lead_id` и `status`. `save_partial`/`finish` возвращают сохранённую заявку как обычно | `LeadService._save_and_notify` в [services.py](../../../backend/src/leads/services.py) |
| Сбой записи (`upsert_open`) | Пробрасывается вызывающему; уведомление не отправляется | там же |

Ограничения:

- `TelegramManagerNotifier` сам ошибок не ловит. `TelegramBadRequest` от `send_document` ведёт к `send_photo`; прочие ошибки документа и любые ошибки `send_message` и `send_photo` уходят в `LeadService`, где логируются.

- Повторной отправки нет: после сбоя менеджер сообщения не получит, заявка видна только в списке (редактор/API). Очереди повторов нет.
- Частичный сбой отправки (текст ушёл, файл нет) порт не различает: это одно исключение из `send`.
- Сбой уведомления не влияет на диалог: пользователь получает финальный экран.

# settings: архитектура

Настройки напоминания о брошенной анкете. Серверная часть: [dialog](../../services/dialog/ARCHITECTURE.md), контракт: [API.md](../../services/API.md). Менеджерского чата в настройках нет ни в каком виде.

| Слой | Файл | Роль |
|---|---|---|
| Типы | [types/settings.ts](../../../editor/app/types/settings.ts) | `ReminderSettings {hours, text}`, `ReminderErrors`, границы `REMINDER_MIN_HOURS` 1, `REMINDER_MAX_HOURS` 168, `REMINDER_MAX_TEXT` 1024 |
| Порт | [settings.port.ts](../../../editor/app/repositories/settings.port.ts) | `getReminder()`, `saveReminder(settings)` |
| Адаптер | [settings.http.ts](../../../editor/app/repositories/adapters/settings.http.ts) | `GET` и `PUT /api/settings/reminder`; 422 это `SettingsInvalid` |
| Мок | [settings.mock.ts](../../../editor/app/repositories/adapters/settings.mock.ts) | значение в памяти |
| Store | [settings.store.ts](../../../editor/app/stores/settings.store.ts) | `reminder`, `errors`, `saved`, `loaded`; `load`, `save` с проверкой до запроса |
| Композаблы | [useLoadSettings](../../../editor/app/composables/useLoadSettings.ts), [useSaveReminder](../../../editor/app/composables/useSaveReminder.ts) | загрузить; сохранить (сбой связи текстом, ошибки полей остаются в store) |
| Компонент, страница | [SettingsForm](../../../editor/app/components/SettingsForm.vue), [settings.vue](../../../editor/app/pages/settings.vue) | форма по артборду `SettingsForm`; страница показывает её после загрузки |

Проверка в store, до запроса: `hours` целое от 1 до 168, `text` не пуст после `trim` и не длиннее 1024 знаков. Тексты ошибок: "Укажите целое число часов от 1 до 168.", "Напишите текст напоминания.", "Не больше 1024 знаков.". Ошибка стоит у своего поля, запрос не уходит. Успех: "Сохранено" рядом с кнопкой до следующей попытки; на сервер уходит текст без пробелов по краям, форма получает его обратно.

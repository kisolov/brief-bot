# leads: архитектура

Заявки клиентов: список, фильтр, карточка, файл ТЗ. Серверная часть: [leads](../../services/leads/ARCHITECTURE.md), контракт: [API.md](../../services/API.md). Домен ничего не знает о сценарии.

| Слой | Файл | Роль |
|---|---|---|
| Типы | [types/lead.ts](../../../editor/app/types/lead.ts) | `Lead` (зеркало `LeadDto`: `id, branch, username, status, createdAt, lastStep, hasFile, answers`), `LeadAnswer {key, value}`, `LeadStatus` (`partial` / `full`), `LeadFilter` (`all` + статусы) |
| Порт | [lead.port.ts](../../../editor/app/repositories/lead.port.ts) | `list(status?)`, `downloadFile(id): LeadFile` (`blob`, `name`) |
| Адаптер | [lead.http.ts](../../../editor/app/repositories/adapters/lead.http.ts) | `GET /api/leads` (`query.status`), `GET /api/leads/{id}/file` как `blob`; 413 это `FileTooLarge`, 404 это `LeadNotFound` |
| Мок | [lead.mock.ts](../../../editor/app/repositories/adapters/lead.mock.ts) | пять заявок: две брошенные, одна с файлом, одна вчерашняя, одна старая; `oversized` имитирует 413 |
| Store | [lead.store.ts](../../../editor/app/stores/lead.store.ts) | `leads` (весь список), `filter`, `selectedId`, `visible` (фильтр на клиенте), `selected`; `load`, `setFilter`, `select`, `downloadFile` |
| Утилиты | [utils/lead.ts](../../../editor/app/utils/lead.ts), [utils/when.ts](../../../editor/app/utils/when.ts) | показ заявки: имя, клиент в таблице, подпись статуса, верхний блок и остальные ответы; "Сегодня, 14:12" |
| Композаблы | [useBrowseLeads](../../../editor/app/composables/useBrowseLeads.ts) (выбрать заявку, поставить фильтр), [useLoadLeads](../../../editor/app/composables/useLoadLeads.ts), [useDownloadLeadFile](../../../editor/app/composables/useDownloadLeadFile.ts), общий [usePageGuard](../../../editor/app/composables/usePageGuard.ts) | загрузить список; скачать ТЗ; 401 ведёт на `/login`, остальное текстом |
| Компоненты | [LeadsTable](../../../editor/app/components/LeadsTable.vue), [LeadDetail](../../../editor/app/components/LeadDetail.vue) | одноимённые артборды [макета](../../../design/shared/project) |
| Страница | [leads.vue](../../../editor/app/pages/leads.vue) | грузит список при открытии, связывает таблицу и карточку |

## Что показывается

- Таблица: "Когда" (`formatWhen`), "Клиент", "Запрос" (`branch`), "Статус". Клиент это ответ "Имя", иначе `@username`, иначе "Заявка #id".
- Статус: полная "Полная"; брошенная "Брошена на шаге «<lastStep>»" (`lastStep` это первая строка текста шага, как его пишет backend; в таблице обрезается многоточием до 260 px, полный текст в `title`), без `lastStep` просто "Брошена".
- Карточка: имя это ответ "Имя", иначе "Заявка #id". Подзаголовок "направление. когда". Верхний блок: "Телефон", "Мессенджер", "Удобное время" (только те, что есть). Остальные ответы, кроме "Имя", списком в порядке прохождения.
- "Скачать ТЗ" есть только при `hasFile`; это ссылка на `/api/leads/{id}/file`, но клик перехватывается: файл забирается запросом и отдаётся браузеру под именем из `Content-Disposition` (`tz-<id><суффикс>`, адаптер читает заголовок через `$fetch.raw`, без заголовка `tz-<id>`), чтобы ошибку показать текстом. Якорь на время клика добавляется в `document.body`, ссылка на blob отзывается через секунду. Ошибка запоздавшего ответа по уже не выбранной заявке не показывается.
- Длинные значения без пробелов переносятся (`overflow-wrap: anywhere`), в карточке переводы строк сохраняются (`pre-wrap`).
- Бейджа числа заявок у вкладки "Заявки" нет (см. [DESIGN](../DESIGN.md)).

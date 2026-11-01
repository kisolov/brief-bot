# Редактор: сквозные сценарии

## Первый вход

```
бот: /editor → ссылка <EDITOR_BASE_URL>/login?token=...
login.vue → useExchangeToken → AuthRepository.exchange → POST /api/auth/exchange (204, cookie editor_session)
  успех → переход на /
  нет токена, 401, сбой → текст "Откройте редактор командой /editor в боте."
```

## Открыть сценарий

```
index.vue (onMounted) → useLoadScenario → scenario store load()
  → ScenarioRepository.getDraft + getVersions (параллельно)
  → store: steps, entry, blocks, revision, activeVersion
useScenarioLayout (computed от store) → toFlow(сценарий, вкладка) → autoLayout → nodes, edges
ScenarioGraph рисует; клик по ноде шага → store.select → рамка выбора
```

## Сессия кончилась

```
любой запрос → 401 → адаптер: SessionExpired → useLoadScenario → router.replace('/login')
```

Дальше человек открывает редактор новой ссылкой из бота.

## Править шаг и сохранить черновик

```
StepPanel (ввод) → useEditStep.updateStep / updateOption → store: новый объект steps, edits++, dirty
useAutosaveDraft (watch edits) → 800 мс тишины → store.flush
  → очередь: ScenarioRepository.saveDraft(toDraftData(), revision) → PUT /api/scenario/draft
  → ответ: revision обновлена; если edits изменился за время запроса, dirty остаётся, сохранение повторится
  409 → conflict: правки заблокированы, текст конфликта
  сбой сети → saveFailed, правки остаются
шапка: status из useAutosaveDraft ("Сохраняем…", "Черновик сохранён в HH:MM", тексты сбоев)
```

## Добавить шаг и соединить

```
палитра: клик → useAddStep(type, {pos: центр видимой части, view}) ; бросок → pos в месте броска
StepPanel "Новый шаг…" → useAddStep(info, {from: {step, handle}}) → шаг рядом с источником + переход
стрелка между портами → ScenarioGraph connect → useConnectSteps.connect (только шаг → шаг)
список "Куда ведёт" → useConnectSteps.connect / disconnect
перетаскивание ноды → useEditStep.moveStep → pos
"Разложить" → useScenarioLayout.relayout → layoutTab (dagre вкладки) → store.setPositions → pos, один шаг отмены
```

## Опубликовать

```
"Опубликовать" (шапка) → usePublishScenario → store.publish
  → flush (сохранить черновик) → ScenarioRepository.publish → POST /api/scenario/publish
  успех: activeVersion = N, issues очищены, шапка "В боте: версия N"
  422: issues в store → useScenarioLayout метит ноды (state=error, номера) → ErrorsPanel
       клик по ошибке → useScenarioLayout.jumpTo (вкладка, выбор шага) + ScenarioGraph.reveal (прокрутка к шагу)
       StepPanel показывает ошибки шага полосой, "Ко всем ошибкам" возвращает список
  сбой сети: notice над схемой
```

## Бейдж "В боте"

```
layouts/default.vue (onMounted) → useLoadVersions → scenario store loadVersions()
  → ScenarioRepository.getVersions → versions, activeVersion
шапка: "В боте: версия N" на любой странице; схема для этого не открывается
публикация: store.publish → после успеха список версий читается заново
```

## Заявки

```
leads.vue (onMounted) → useLoadLeads → lead store load() → LeadRepository.list → GET /api/leads
фильтр "Все / Полные / Брошенные" → store.setFilter → visible (на клиенте); выбор остаётся на видимой заявке
клик по строке → store.select → LeadDetail
"Скачать ТЗ" → useDownloadLeadFile → store.downloadFile → GET /api/leads/{id}/file (blob)
  успех: браузер сохраняет tz-<id>; 413: "Файл больше 20 МБ. Telegram не отдаёт такие файлы ботам."
```

## Настройки

```
settings.vue (onMounted) → useLoadSettings → settings store load() → GET /api/settings/reminder
"Сохранить" → useSaveReminder → store.save
  часы не 1..168 или текст пуст/длиннее 1024: errors у полей, запроса нет
  иначе PUT /api/settings/reminder → "Сохранено"
```

## Вернуть версию

```
versions.vue: "Вернуть" → useActivateVersion(n)
  store.needsRollbackConfirm (есть правки или совпадение с версией неизвестно) → confirm "Черновик будет заменён версией N. Продолжить?"; отказ: ничего не меняется
  → store.activate(n): дождаться сохранения в полёте → POST /api/scenario/versions/{n}/activate (черновик становится копией версии)
  → store.load(): черновик, версии, шапка "В боте: версия N"
```

## Любая страница: 401

`SessionExpired` → [usePageGuard](../../editor/app/composables/usePageGuard.ts) (или композабл загрузки сценария) → `/login`.

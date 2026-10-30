# dialog: потоки

Описано то, что работает сейчас: движок, хранилища, usecase и Telegram-слой. Отправка напоминаний по таймеру ещё не написана.

## Одно событие

```
событие -> step(scenario, session, event)
  finished?  -> кнопка finish-шага -> _restart (новый проход) | иначе тот же экран
  чужой шаг? -> тот же экран
  pending?   -> _on_pending (текст опции | back отменяет опцию)
  иначе      -> _on_button | _on_done | _on_back | _on_text | _on_file
                  -> _advance -> _resolve (Call / @return / пропуск по when)
                       -> история + снимки, терминал? finished + FINISHED : PROGRESS
  -> StepResult(session, screen, effects)
```

## Состояние между событиями

```
SessionRepository.get(chat_id) -> Session | None   (None: new_session)
step(...) -> StepResult
SessionRepository.save(result.session)             (JSON, TTL 30 дней)
ReminderQueue.schedule(chat_id, at) | cancel(chat_id)   (schedule после due создаёт новую запись)
```

## Напоминания (хранилище)

```
задача раз в минуту (позже) -> ReminderQueue.due(now, limit) -> [chat_id]
  due забирает записи (повторно не выдаст); отправка запланирована, задачи пока нет
```

## Прохождение с возвратом

```
choice -> step A -> Call(block, then=T) -> блок -> ... -> @return -> T
                                    returns: () -> (T,) -> ()
back с шага внутри блока: стек возвращается из history_returns[-1]
```

## Апдейт Telegram

```
Update -> router -> Event (start | button | done | back | text | file)
  HandleEvent(chat_id, username, event)
    нет сессии | start после финала -> DialogService.start -> экран входа
    start в середине анкеты          -> экран возобновления (@resume) | текущий экран
    иначе DialogService.apply -> StepResult
      FINISHED -> build_lead -> LeadService.finish (запись, затем менеджер) -> cancel -> save
      PROGRESS -> save -> schedule | cancel напоминания
  Screen -> render: edit_text на нажатом сообщении | снять клавиатуру + новое сообщение
r:continue | r:restart -> ResumeOrRestart -> Screen
```

## Старт приложения

```
lifespan: init_resources (postgres, redis, бот) -> apply_migrations -> EnsureSeeded
  -> polling_enabled? start_polling(handle_as_tasks=False) задачей
выход: отмена задачи -> shutdown_resources
```

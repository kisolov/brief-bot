# dialog: потоки

Описано то, что работает сейчас: движок и хранилища. Склейка (usecase, Telegram) запланирована.

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
ReminderQueue.schedule(chat_id, at) | cancel(chat_id)
```

## Напоминания (хранилище)

```
задача раз в минуту (позже) -> ReminderQueue.due(now, limit) -> [chat_id]
  -> для каждого: отправка и cancel(chat_id)   (usecase запланирован)
```

## Прохождение с возвратом

```
choice -> step A -> Call(block, then=T) -> блок -> ... -> @return -> T
                                    returns: () -> (T,) -> ()
back с шага внутри блока: стек возвращается из history_returns[-1]
```

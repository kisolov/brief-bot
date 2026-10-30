# leads: сценарии

Вызывающая сторона передаёт собранный `Lead`; домен сам статус не выбирает.

## Сохранение проходов

```
save_partial(lead) -> status=partial -> upsert_open -> notify
finish(lead)       -> status=full    -> upsert_open -> notify

upsert_open(lead), под блокировкой на chat_id:
  есть partial у чата -> UPDATE той же строки (id и created_at прежние)
  иначе               -> INSERT новой строки
  full никогда не обновляется

notify: format_lead(saved) -> ManagerNotifier.send(parts, saved.file_id)
        сбой send -> logger.error(lead_id, status), заявка остаётся, результат возвращается
```

| Ситуация | Итог в хранилище |
|---|---|
| partial, затем finish | одна строка, тот же `id`, статус `full`, `created_at` обновлён |
| partial, затем ещё partial | одна строка, обновлённые ответы и `last_step` |
| finish, затем новый проход (partial) | две строки: прежняя `full` нетронута, новая `partial` |
| finish без предшествующего partial | новая строка `full` |

Каждое сохранение шлёт менеджеру сообщение: повторный `save_partial` или `finish` по той же заявке отправляет текст снова. Дедупликации в домене нет.

## Форматирование

```
Lead -> строки (заголовок, направление, Telegram, последний шаг, ответы)
     -> текст через "\n" -> части по границе строк, лимит 4096 единиц UTF-16
     -> длинная строка режется жёстко; пустые части отбрасываются
```

Правила разбиения: [INVARIANTS.md](INVARIANTS.md).

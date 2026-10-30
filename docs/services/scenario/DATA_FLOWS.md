# scenario: потоки

## Первый запуск

```
lifespan (позже) -> ScenarioService.ensure_seeded
  -> repo.seed(dump_scenario(load_seed()))
       версий нет:  версия 1 (active) + черновик revision 1 -> True
       версии есть: ничего                                  -> False
```

## Правка и публикация

```
редактор -> save_draft(data, base_revision) -> revision+1  (или DraftConflict)
         -> publish()
              get_draft -> parse_scenario ---- ScenarioMalformed --> ScenarioInvalid([malformed])
                        -> validate_scenario -- issues ------------> ScenarioInvalid(issues)
                        -> repo.publish(data)  -> номер max+1, active
```

## Откат

```
rollback(n) -> activate_version(n)   одна транзакция:
                 версии n нет --> NotFound
                 active = n; черновик = данные версии n, revision+1
                 сбой --> откат всего
```

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

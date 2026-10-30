# access: инварианты

| Правило | Где держится |
|---|---|
| В базе только SHA-256 токена; сам токен существует лишь в ссылке и cookie | `AccessService._hash`; тест `test_database_keeps_only_hashes` |
| Токен это `secrets.token_urlsafe(32)` | `AccessService._issue` |
| Ссылка одноразовая: из параллельных обменов выигрывает ровно один | один `UPDATE ... WHERE used_at IS NULL ... RETURNING` в [asyncpg.py](../../../backend/src/access/adapters/asyncpg.py); тест `test_parallel_exchange_has_one_winner` |
| Ссылка живёт 10 минут, сессия 24 часа; граница исключающая (`expires_at > now`) | `LINK_TTL`, `SESSION_TTL` в [services.py](../../../backend/src/access/services.py), оба адаптера |
| Ссылка не принимается как сессия, сессия не обменивается как ссылка | фильтр по `kind` в обоих методах `TokenRepository` |
| Администратором становятся по записи в `admins` или по коду приглашения | `IssueEditorLink` |
| Код приглашения сравнивается `secrets.compare_digest` над байтами: не-ASCII ввод не роняет сравнение | `IssueEditorLink._invite_matches` |
| Код приглашения и токены в лог не попадают; в `extra` только `telegram_id` | usecase |
| Отказ `/editor` не раскрывает причину: одинаковый текст при неверном коде и без кода | [router.py](../../../backend/src/bootstrap/telegram/router.py) |
| `/editor` работает только в личном чате: из группы бот не отвечает, ссылка и код не видны участникам | фильтр `F.chat.type == "private"` в [router.py](../../../backend/src/bootstrap/telegram/router.py) |
| Cookie `editor_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=86400` | [auth.py](../../../backend/src/bootstrap/endpoints/auth.py) |
| Время передаётся в сервис снаружи, домен часов не читает | сигнатуры `issue_link(now)`, `exchange(token, now)`, `check_session(token, now)` |
| Менеджерский чат недоступен редактору: ни один эндпойнт и схема его не содержат | тест `test_no_endpoint_exposes_manager_chat` |

# access: сценарии

## Вход в редактор

```
/editor [код] (Telegram, from_user.id)
  IssueEditorLink(telegram_id, код)
    администратор                    -> ссылка
    не администратор, код верный     -> add_admin -> ссылка
    иначе                            -> NotAdmin -> ответ "Эта команда только для администраторов."
  ссылка: issue_link(now) -> хеш в editor_tokens (kind=link, expires_at = now+10 мин)
          ответ в чат: <EDITOR_BASE_URL>/login?token=<токен>, действует 10 минут

браузер: /login?token=... -> POST /api/auth/exchange {token}
  ExchangeToken -> AccessService.exchange(token, now)
    UPDATE editor_tokens SET used_at=now
      WHERE token_hash=$1 AND kind='link' AND used_at IS NULL AND expires_at > now
    0 строк -> InvalidEditorToken -> 401
    1 строка -> issue(session, now+24 ч) -> Set-Cookie editor_session
```

Ответ бота при неверном коде и при отсутствии кода одинаков: подбор кода не отличить от обычного отказа.

## Проверка запроса

```
любой /api/* кроме /api/auth/exchange
  cookie editor_session нет                -> InvalidEditorToken -> 401
  CheckEditorSession(token) -> check_session(token, now)
    SELECT ... WHERE token_hash=$1 AND kind='session' AND expires_at > now
    нет строки                             -> 401
```

Выход из редактора и отзыв сессии не реализованы: сессия живёт до `expires_at`.

"""Администраторы и токены редактора в postgres: таблицы admins и editor_tokens."""

from datetime import datetime

from src.access.entities import TokenKind
from src.access.ports import AdminRepository, TokenRepository
from src.shared.asyncpg_db import AsyncpgDatabase


class AsyncpgAdminRepository(AdminRepository):
    def __init__(self, db: AsyncpgDatabase) -> None:
        self._pool = db.pool

    async def exists(self, telegram_id: int) -> bool:
        return bool(
            await self._pool.fetchval("SELECT 1 FROM admins WHERE telegram_id = $1", telegram_id)
        )

    async def add(self, telegram_id: int) -> None:
        await self._pool.execute(
            "INSERT INTO admins (telegram_id) VALUES ($1) ON CONFLICT DO NOTHING", telegram_id
        )


class AsyncpgTokenRepository(TokenRepository):
    def __init__(self, db: AsyncpgDatabase) -> None:
        self._pool = db.pool

    async def add(self, token_hash: str, kind: TokenKind, expires_at: datetime) -> None:
        await self._pool.execute(
            "INSERT INTO editor_tokens (token_hash, kind, expires_at) VALUES ($1, $2, $3)",
            token_hash,
            kind.value,
            expires_at,
        )

    async def consume_link(self, token_hash: str, now: datetime) -> bool:
        # Один UPDATE: из параллельных обменов строку получит только один.
        row = await self._pool.fetchrow(
            "UPDATE editor_tokens SET used_at = $2 "
            "WHERE token_hash = $1 AND kind = 'link' AND used_at IS NULL AND expires_at > $2 "
            "RETURNING token_hash",
            token_hash,
            now,
        )
        return row is not None

    async def session_valid(self, token_hash: str, now: datetime) -> bool:
        return bool(
            await self._pool.fetchval(
                "SELECT 1 FROM editor_tokens "
                "WHERE token_hash = $1 AND kind = 'session' AND expires_at > $2",
                token_hash,
                now,
            )
        )

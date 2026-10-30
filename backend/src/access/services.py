"""Сервис доступа: администраторы, одноразовые ссылки и сессии редактора."""

import hashlib
import secrets
from datetime import datetime, timedelta

from src.access.entities import TokenKind
from src.access.exceptions import InvalidEditorToken
from src.access.ports import AdminRepository, TokenRepository

LINK_TTL = timedelta(minutes=10)
SESSION_TTL = timedelta(hours=24)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class AccessService:
    def __init__(self, admins: AdminRepository, tokens: TokenRepository) -> None:
        self._admins = admins
        self._tokens = tokens

    async def is_admin(self, telegram_id: int) -> bool:
        return await self._admins.exists(telegram_id)

    async def add_admin(self, telegram_id: int) -> None:
        await self._admins.add(telegram_id)

    async def issue_link(self, now: datetime) -> str:
        return await self._issue(TokenKind.LINK, now + LINK_TTL)

    async def exchange(self, token: str, now: datetime) -> str:
        """Меняет ссылку на сессию. Ссылка сгорает; InvalidEditorToken, если она негодна."""
        if not await self._tokens.consume_link(_hash(token), now):
            raise InvalidEditorToken("ссылка неизвестна, просрочена или уже использована")
        return await self._issue(TokenKind.SESSION, now + SESSION_TTL)

    async def check_session(self, token: str, now: datetime) -> None:
        if not await self._tokens.session_valid(_hash(token), now):
            raise InvalidEditorToken("сессия неизвестна или просрочена")

    async def _issue(self, kind: TokenKind, expires_at: datetime) -> str:
        token = secrets.token_urlsafe(32)
        await self._tokens.add(_hash(token), kind, expires_at)
        return token

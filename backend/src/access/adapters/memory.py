"""Администраторы и токены в памяти для тестов и локального запуска."""

from datetime import datetime

from src.access.entities import TokenKind
from src.access.ports import AdminRepository, TokenRepository


class InMemoryAdminRepository(AdminRepository):
    def __init__(self) -> None:
        self._ids: set[int] = set()

    async def exists(self, telegram_id: int) -> bool:
        return telegram_id in self._ids

    async def add(self, telegram_id: int) -> None:
        self._ids.add(telegram_id)


class InMemoryTokenRepository(TokenRepository):
    def __init__(self) -> None:
        # хеш -> (вид, срок, использован)
        self._tokens: dict[str, tuple[TokenKind, datetime, bool]] = {}

    @property
    def hashes(self) -> set[str]:
        return set(self._tokens)

    async def add(self, token_hash: str, kind: TokenKind, expires_at: datetime) -> None:
        self._tokens[token_hash] = (kind, expires_at, False)

    async def consume_link(self, token_hash: str, now: datetime) -> bool:
        found = self._tokens.get(token_hash)
        if found is None:
            return False
        kind, expires_at, used = found
        if kind is not TokenKind.LINK or used or expires_at <= now:
            return False
        self._tokens[token_hash] = (kind, expires_at, True)
        return True

    async def session_valid(self, token_hash: str, now: datetime) -> bool:
        found = self._tokens.get(token_hash)
        return found is not None and found[0] is TokenKind.SESSION and found[1] > now

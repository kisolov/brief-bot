"""Порты доступа: администраторы и токены редактора. В хранилище только хеши токенов."""

from abc import ABC, abstractmethod
from datetime import datetime

from src.access.entities import TokenKind


class AdminRepository(ABC):
    @abstractmethod
    async def exists(self, telegram_id: int) -> bool: ...

    @abstractmethod
    async def add(self, telegram_id: int) -> None:
        """Повторное добавление не ошибка."""


class TokenRepository(ABC):
    @abstractmethod
    async def add(self, token_hash: str, kind: TokenKind, expires_at: datetime) -> None: ...

    @abstractmethod
    async def consume_link(self, token_hash: str, now: datetime) -> bool:
        """Атомарно помечает ссылку использованной.

        True у ровно одного из параллельных вызовов; False для неизвестной, использованной
        или просроченной (expires_at <= now) ссылки.
        """

    @abstractmethod
    async def session_valid(self, token_hash: str, now: datetime) -> bool:
        """Есть сессия с таким хешем и она не просрочена (expires_at > now)."""

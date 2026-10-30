"""Порты хранения диалога: сессии и очередь напоминаний."""

from abc import ABC, abstractmethod
from datetime import datetime

from src.dialog.entities import Session


class SessionRepository(ABC):
    @abstractmethod
    async def get(self, chat_id: int) -> Session | None: ...

    @abstractmethod
    async def save(self, session: Session) -> None: ...

    @abstractmethod
    async def delete(self, chat_id: int) -> None: ...


class ReminderQueue(ABC):
    @abstractmethod
    async def schedule(self, chat_id: int, at: datetime) -> None:
        """Ставит или сдвигает срок напоминания чата. at должен быть с часовым поясом."""

    @abstractmethod
    async def cancel(self, chat_id: int) -> None:
        """Снимает напоминание; отсутствие записи не ошибка."""

    @abstractmethod
    async def due(self, now: datetime, limit: int) -> list[int]:
        """Чаты, чей срок не позже now, от самого раннего срока. Записи не удаляет."""

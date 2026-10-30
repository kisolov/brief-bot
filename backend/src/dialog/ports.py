"""Порты диалога: сессии, очередь напоминаний, настройки напоминания и отправка в чат."""

from abc import ABC, abstractmethod
from datetime import datetime

from src.dialog.entities import ReminderSettings, Session


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
        """Забирает чаты, чей срок не позже now, от самого раннего срока: записи удаляются.

        Атомарно: параллельные вызовы не получат один чат дважды. Новое `schedule` после
        `due` создаёт новую запись.
        """


class SettingsRepository(ABC):
    @abstractmethod
    async def get_reminder(self) -> ReminderSettings:
        """Настройки напоминания; если их ещё не сохраняли, значения по умолчанию."""

    @abstractmethod
    async def save_reminder(self, settings: ReminderSettings) -> None: ...


class ChatGateway(ABC):
    @abstractmethod
    async def send_reminder(self, chat_id: int, text: str) -> None:
        """Шлёт напоминание с кнопками "Продолжить" и "Начать заново".

        Бросает ChatBlocked, если пользователь заблокировал бота.
        """

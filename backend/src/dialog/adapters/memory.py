"""Сессии и очередь напоминаний в памяти для тестов и локального запуска."""

from datetime import datetime

from src.dialog.entities import ReminderSettings, Session
from src.dialog.ports import ReminderQueue, SessionRepository, SettingsRepository


class InMemorySessionRepository(SessionRepository):
    def __init__(self) -> None:
        self._sessions: dict[int, Session] = {}

    async def get(self, chat_id: int) -> Session | None:
        return self._sessions.get(chat_id)

    async def save(self, session: Session) -> None:
        self._sessions[session.chat_id] = session

    async def delete(self, chat_id: int) -> None:
        self._sessions.pop(chat_id, None)


class InMemoryReminderQueue(ReminderQueue):
    def __init__(self) -> None:
        self._deadlines: dict[int, datetime] = {}

    async def schedule(self, chat_id: int, at: datetime) -> None:
        self._deadlines[chat_id] = at

    async def cancel(self, chat_id: int) -> None:
        self._deadlines.pop(chat_id, None)

    async def due(self, now: datetime, limit: int) -> list[int]:
        past = sorted((at, chat_id) for chat_id, at in self._deadlines.items() if at <= now)
        taken = [chat_id for _, chat_id in past[:limit]]
        for chat_id in taken:
            del self._deadlines[chat_id]
        return taken


class InMemorySettingsRepository(SettingsRepository):
    def __init__(self) -> None:
        self._reminder = ReminderSettings()

    async def get_reminder(self) -> ReminderSettings:
        return self._reminder

    async def save_reminder(self, settings: ReminderSettings) -> None:
        self._reminder = settings

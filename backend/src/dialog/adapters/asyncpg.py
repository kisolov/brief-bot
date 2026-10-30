"""Настройки диалога в postgres: таблица settings, ключ reminder."""

from src.dialog.entities import ReminderSettings
from src.dialog.ports import SettingsRepository
from src.shared.asyncpg_db import AsyncpgDatabase

REMINDER_KEY = "reminder"


class AsyncpgSettingsRepository(SettingsRepository):
    def __init__(self, db: AsyncpgDatabase) -> None:
        self._pool = db.pool

    async def get_reminder(self) -> ReminderSettings:
        value = await self._pool.fetchval("SELECT value FROM settings WHERE key = $1", REMINDER_KEY)
        defaults = ReminderSettings()
        if not isinstance(value, dict):
            return defaults
        return ReminderSettings(
            hours=value.get("hours", defaults.hours),
            text=value.get("text", defaults.text),
        )

    async def save_reminder(self, settings: ReminderSettings) -> None:
        await self._pool.execute(
            "INSERT INTO settings (key, value) VALUES ($1, $2) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            REMINDER_KEY,
            {"hours": settings.hours, "text": settings.text},
        )

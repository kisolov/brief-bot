"""Настройки диалога в postgres: таблица settings, ключ reminder."""

from src.dialog.entities import ReminderSettings
from src.dialog.ports import SettingsRepository
from src.shared.asyncpg_db import AsyncpgDatabase
from src.shared.logger import get_logger

logger = get_logger(__name__)

REMINDER_KEY = "reminder"


class AsyncpgSettingsRepository(SettingsRepository):
    def __init__(self, db: AsyncpgDatabase) -> None:
        self._pool = db.pool

    async def get_reminder(self) -> ReminderSettings:
        value = await self._pool.fetchval("SELECT value FROM settings WHERE key = $1", REMINDER_KEY)
        defaults = ReminderSettings()
        if value is None:
            return defaults
        hours = value.get("hours") if isinstance(value, dict) else None
        text = value.get("text") if isinstance(value, dict) else None
        valid = (
            isinstance(hours, int)
            and not isinstance(hours, bool)
            and hours > 0
            and isinstance(text, str)
            and text.strip() != ""
        )
        if not valid:
            # Испорченная запись не должна ронять ход пользователя: работаем по умолчанию.
            logger.warning("Reminder settings are corrupted, defaults used")
            return defaults
        return ReminderSettings(hours=hours, text=text)

    async def save_reminder(self, settings: ReminderSettings) -> None:
        await self._pool.execute(
            "INSERT INTO settings (key, value) VALUES ($1, $2) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            REMINDER_KEY,
            {"hours": settings.hours, "text": settings.text},
        )

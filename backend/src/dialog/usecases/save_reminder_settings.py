"""Сценарий: сохранить настройки напоминания из редактора."""

from src.dialog.entities import ReminderSettings
from src.dialog.services import DialogService
from src.shared.logger import get_logger

logger = get_logger(__name__)


class SaveReminderSettings:
    def __init__(self, dialog: DialogService) -> None:
        self._dialog = dialog

    async def __call__(self, settings: ReminderSettings) -> ReminderSettings:
        await self._dialog.save_reminder_settings(settings)
        logger.info("Reminder settings saved", extra={"hours": settings.hours})
        return settings

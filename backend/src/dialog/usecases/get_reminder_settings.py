"""Сценарий: настройки напоминания для редактора."""

from src.dialog.entities import ReminderSettings
from src.dialog.services import DialogService


class GetReminderSettings:
    def __init__(self, dialog: DialogService) -> None:
        self._dialog = dialog

    async def __call__(self) -> ReminderSettings:
        return await self._dialog.reminder_settings()

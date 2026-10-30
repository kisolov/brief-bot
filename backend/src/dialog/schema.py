"""DTO настроек напоминания для HTTP API."""

from pydantic import Field

from src.dialog.entities import ReminderSettings
from src.shared.base_camel_model import CamelModel


class ReminderSettingsDto(CamelModel):
    hours: int = Field(ge=1, le=168)
    text: str = Field(min_length=1, max_length=1024)

    @classmethod
    def from_domain(cls, settings: ReminderSettings) -> "ReminderSettingsDto":
        return cls(hours=settings.hours, text=settings.text)

    def to_domain(self) -> ReminderSettings:
        return ReminderSettings(hours=self.hours, text=self.text)

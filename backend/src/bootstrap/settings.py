"""Настройки Telegram-бота."""

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class TelegramSettings(BaseSettings):
    token: SecretStr = Field(min_length=1)
    manager_chat_id: int
    invite_code: SecretStr = Field(min_length=1)
    # false: приложение стартует без опроса Telegram (тесты, e2e без токена).
    polling_enabled: bool = True

    model_config = SettingsConfigDict(env_prefix="TELEGRAM_", extra="ignore", env_file=".env")


class EditorSettings(BaseSettings):
    # Адрес редактора, на который ведёт ссылка из бота; хвостовой / не нужен.
    base_url: str = Field(min_length=1)

    model_config = SettingsConfigDict(env_prefix="EDITOR_", extra="ignore", env_file=".env")

    @field_validator("base_url")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

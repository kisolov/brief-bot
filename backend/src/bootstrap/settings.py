"""Настройки Telegram-бота."""

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class TelegramSettings(BaseSettings):
    token: SecretStr = Field(min_length=1)
    manager_chat_id: int
    invite_code: SecretStr = Field(min_length=1)
    # false: приложение стартует без опроса Telegram (тесты, e2e без токена).
    polling_enabled: bool = True

    model_config = SettingsConfigDict(env_prefix="TELEGRAM_", extra="ignore", env_file=".env")

"""Клиент redis. Ответы приходят строками, а не байтами."""

from collections.abc import AsyncIterator

from pydantic_settings import BaseSettings, SettingsConfigDict
from redis.asyncio import Redis


class RedisSettings(BaseSettings):
    # Значение по умолчанию совпадает с docker-compose.yml.
    url: str = "redis://localhost:56379/0"

    model_config = SettingsConfigDict(env_prefix="REDIS_", extra="ignore", env_file=".env")


async def initialize(settings: RedisSettings) -> AsyncIterator[Redis]:
    """Для providers.Resource: открывает клиент и закрывает его при остановке контейнера."""
    client = Redis.from_url(settings.url, decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()

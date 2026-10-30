"""Пул соединений postgres. jsonb читается и пишется как python-объект."""

import json
from collections.abc import AsyncIterator

import asyncpg
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class PostgresSettings(BaseSettings):
    # Значение по умолчанию совпадает с docker-compose.yml.
    dsn: SecretStr = SecretStr("postgresql://brief:brief@localhost:55432/brief")

    model_config = SettingsConfigDict(env_prefix="POSTGRES_", extra="ignore", env_file=".env")


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec(
        "jsonb",
        encoder=lambda value: json.dumps(value, ensure_ascii=False),
        decoder=json.loads,
        schema="pg_catalog",
    )


class AsyncpgDatabase:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    @classmethod
    async def connect(
        cls, settings: PostgresSettings, search_path: str | None = None
    ) -> "AsyncpgDatabase":
        """search_path нужен тестам: каждый получает свою схему."""
        server_settings = {"search_path": search_path} if search_path else None
        pool = await asyncpg.create_pool(
            settings.dsn.get_secret_value(),
            init=_init_connection,
            server_settings=server_settings,
        )
        return cls(pool)

    @classmethod
    async def initialize(cls, settings: PostgresSettings) -> AsyncIterator["AsyncpgDatabase"]:
        """Для providers.Resource: открывает пул и закрывает его при остановке контейнера."""
        database = await cls.connect(settings)
        try:
            yield database
        finally:
            await database.close()

    async def close(self) -> None:
        await self.pool.close()

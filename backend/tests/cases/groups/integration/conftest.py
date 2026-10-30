"""Фикстуры для интеграционных тестов: нужны postgres на 55432 и redis на 56379.

Поднять: `docker compose up -d postgres redis` из корня репозитория.
"""

import uuid
from collections.abc import AsyncIterator

import asyncpg
import pytest
from redis.asyncio import Redis

from src.shared.asyncpg_db import AsyncpgDatabase, PostgresSettings
from src.shared.migrate import MIGRATIONS_DIR, apply_migrations
from src.shared.redis_client import RedisSettings

# Отдельная база redis, чтобы flushdb не задел ничего постороннего.
TEST_REDIS_DB = 15


@pytest.fixture
async def db() -> AsyncIterator[AsyncpgDatabase]:
    """База с миграциями в отдельной схеме: тесты не видят данных друг друга."""
    schema = f"t_{uuid.uuid4().hex[:12]}"
    settings = PostgresSettings()
    admin = await asyncpg.connect(settings.dsn.get_secret_value())
    await admin.execute(f"CREATE SCHEMA {schema}")
    database = await AsyncpgDatabase.connect(settings, search_path=schema)
    try:
        await apply_migrations(database.pool, MIGRATIONS_DIR)
        yield database
    finally:
        await database.close()
        await admin.execute(f"DROP SCHEMA {schema} CASCADE")
        await admin.close()


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    settings = RedisSettings(url=f"redis://localhost:56379/{TEST_REDIS_DB}")
    client = Redis.from_url(settings.url.get_secret_value(), decode_responses=True)
    await client.flushdb()
    try:
        yield client
    finally:
        await client.flushdb()
        await client.aclose()

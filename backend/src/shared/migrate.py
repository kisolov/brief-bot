"""Раннер миграций: SQL-файлы по порядку имён, применённые пишутся в schema_migrations."""

from pathlib import Path

import asyncpg

from src.shared.logger import get_logger

logger = get_logger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"

# Произвольное число для pg_advisory_xact_lock: два процесса не мигрируют одновременно.
_LOCK_KEY = 7_204_001


async def apply_migrations(pool: asyncpg.Pool, directory: Path) -> list[str]:
    """Применяет новые файлы, возвращает их имена. Каждый файл идёт в своей транзакции."""
    async with pool.acquire() as conn:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        applied: list[str] = []
        for path in sorted(directory.glob("*.sql")):
            async with conn.transaction():
                await conn.execute("SELECT pg_advisory_xact_lock($1)", _LOCK_KEY)
                done = await conn.fetchval(
                    "SELECT 1 FROM schema_migrations WHERE name = $1", path.name
                )
                if done:
                    continue
                await conn.execute(path.read_text(encoding="utf-8"))
                await conn.execute("INSERT INTO schema_migrations (name) VALUES ($1)", path.name)
                applied.append(path.name)
                logger.info("Migration applied", extra={"migration": path.name})
        return applied

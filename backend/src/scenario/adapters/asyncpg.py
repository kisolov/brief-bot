"""Хранилище сценария в postgres: таблицы scenario_versions и scenario_draft."""

import asyncpg

from src.scenario.entities import Draft, Scenario, VersionInfo
from src.scenario.exceptions import DraftConflict
from src.scenario.parser import parse_scenario
from src.scenario.ports import ScenarioRepository
from src.shared.asyncpg_db import AsyncpgDatabase
from src.shared.exceptions import NotFound

# Блокировка на время записи версий: номер max+1 не должен достаться двоим.
_VERSIONS_LOCK = 7_204_002


class AsyncpgScenarioRepository(ScenarioRepository):
    def __init__(self, db: AsyncpgDatabase) -> None:
        self._pool = db.pool

    async def get_published(self) -> Scenario:
        row = await self._pool.fetchrow("SELECT number, data FROM scenario_versions WHERE active")
        if row is None:
            raise NotFound("нет опубликованной версии сценария")
        return parse_scenario(row["data"], version=row["number"])

    async def get_version(self, n: int) -> Scenario:
        data = await self._pool.fetchval("SELECT data FROM scenario_versions WHERE number = $1", n)
        if data is None:
            raise NotFound(f"версии {n} нет")
        return parse_scenario(data, version=n)

    async def list_versions(self) -> list[VersionInfo]:
        rows = await self._pool.fetch(
            "SELECT number, published_at, active FROM scenario_versions ORDER BY number"
        )
        return [VersionInfo(r["number"], r["published_at"], r["active"]) for r in rows]

    async def get_draft(self) -> Draft:
        row = await self._pool.fetchrow("SELECT data, revision FROM scenario_draft WHERE id = 1")
        if row is None:
            raise NotFound("черновика нет")
        return Draft(row["data"], row["revision"])

    async def save_draft(self, data: dict, base_revision: int) -> int:
        revision = await self._pool.fetchval(
            "UPDATE scenario_draft SET data = $1, revision = revision + 1, updated_at = now() "
            "WHERE id = 1 AND revision = $2 RETURNING revision",
            data,
            base_revision,
        )
        if revision is None:
            raise DraftConflict("черновик изменён")
        return revision

    async def replace_draft(self, data: dict) -> int:
        return await self._pool.fetchval(
            "INSERT INTO scenario_draft (id, data, revision) VALUES (1, $1, 1) "
            "ON CONFLICT (id) DO UPDATE SET data = $1, revision = scenario_draft.revision + 1, "
            "updated_at = now() RETURNING revision",
            data,
        )

    async def publish(self, data: dict) -> int:
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock($1)", _VERSIONS_LOCK)
            return await _insert_active(conn, data)

    async def set_active(self, n: int) -> None:
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock($1)", _VERSIONS_LOCK)
            if not await conn.fetchval("SELECT 1 FROM scenario_versions WHERE number = $1", n):
                raise NotFound(f"версии {n} нет")
            # Два оператора: индекс не допускает две активные версии даже внутри одного UPDATE.
            await conn.execute("UPDATE scenario_versions SET active = false WHERE active")
            await conn.execute("UPDATE scenario_versions SET active = true WHERE number = $1", n)

    async def seed(self, data: dict) -> bool:
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock($1)", _VERSIONS_LOCK)
            if await conn.fetchval("SELECT 1 FROM scenario_versions LIMIT 1"):
                return False
            await _insert_active(conn, data)
            await conn.execute(
                "INSERT INTO scenario_draft (id, data, revision) VALUES (1, $1, 1) "
                "ON CONFLICT (id) DO NOTHING",
                data,
            )
            return True


async def _insert_active(conn: asyncpg.Connection, data: dict) -> int:
    await conn.execute("UPDATE scenario_versions SET active = false WHERE active")
    return await conn.fetchval(
        "INSERT INTO scenario_versions (number, data, active) "
        "VALUES ((SELECT COALESCE(MAX(number), 0) + 1 FROM scenario_versions), $1, true) "
        "RETURNING number",
        data,
    )

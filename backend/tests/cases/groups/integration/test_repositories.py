import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import asyncpg
import pytest

from src.dialog.adapters.redis import (
    SESSION_TTL_SECONDS,
    RedisReminderQueue,
    RedisSessionRepository,
)
from src.scenario.adapters.asyncpg import AsyncpgScenarioRepository
from src.scenario.exceptions import DraftConflict, ScenarioInvalid
from src.scenario.parser import dump_scenario
from src.scenario.seed import load_seed
from src.scenario.services import ScenarioService
from src.shared.exceptions import NotFound
from src.shared.migrate import MIGRATIONS_DIR, apply_migrations
from tests.cases.groups.unit.test_seed_scenario import BRANCHES, START
from tests.utils.walker import play

pytestmark = pytest.mark.integration

SEED = load_seed()


@pytest.fixture
async def service(db) -> ScenarioService:
    svc = ScenarioService(AsyncpgScenarioRepository(db))
    await svc.ensure_seeded()
    return svc


def _edited(text: str) -> dict:
    data = dump_scenario(SEED)
    data["steps"]["privacy"]["text"] = text
    return data


# --- миграции ---


async def test_migrations_create_all_tables_and_are_idempotent(db):
    await apply_migrations(db.pool, MIGRATIONS_DIR)

    async with db.pool.acquire() as conn:
        tables = {
            r["tablename"]
            for r in await conn.fetch(
                "SELECT tablename FROM pg_tables WHERE schemaname = current_schema()"
            )
        }
        applied = [r["name"] for r in await conn.fetch("SELECT name FROM schema_migrations")]

    assert {
        "scenario_versions",
        "scenario_draft",
        "leads",
        "admins",
        "editor_tokens",
        "settings",
        "schema_migrations",
    } <= tables
    assert applied == ["001_init.sql"]


async def test_leads_allow_one_partial_per_chat(db):
    insert = "INSERT INTO leads (chat_id, status) VALUES ($1, $2)"
    async with db.pool.acquire() as conn:
        await conn.execute(insert, 5, "partial")
        await conn.execute(insert, 5, "full")
        await conn.execute(insert, 5, "full")
        await conn.execute(insert, 6, "partial")
        with pytest.raises(asyncpg.UniqueViolationError):
            await conn.execute(insert, 5, "partial")


# --- сценарий: те же контракты, что у memory ---


async def test_seed_writes_version_one_and_draft(service):
    assert await service.current() == SEED
    assert [(v.number, v.active) for v in await service.versions()] == [(1, True)]
    draft = await service.draft()
    assert draft.data == dump_scenario(SEED)
    assert draft.revision == 1


async def test_ensure_seeded_is_noop_on_filled_storage(service):
    await service.save_draft(_edited("Правка"), base_revision=1)

    assert await service.ensure_seeded() is False
    assert (await service.draft()).revision == 2
    assert len(await service.versions()) == 1


async def test_publish_valid_bumps_version(service):
    await service.save_draft(_edited("Новый текст"), base_revision=1)

    assert await service.publish() == 2

    current = await service.current()
    assert (current.version, current.steps["privacy"].text) == (2, "Новый текст")
    assert [(v.number, v.active) for v in await service.versions()] == [(1, False), (2, True)]
    assert (await service.by_version(1)).steps["privacy"].text != "Новый текст"


async def test_publish_invalid_raises_and_keeps_version(service):
    data = dump_scenario(SEED)
    data["entry"] = "net_takogo_shaga"
    await service.save_draft(data, base_revision=1)

    with pytest.raises(ScenarioInvalid):
        await service.publish()

    assert (await service.current()).version == 1
    assert len(await service.versions()) == 1


async def test_rollback_sets_active_and_replaces_draft(service):
    await service.save_draft(_edited("Вторая версия"), base_revision=1)
    await service.publish()
    await service.save_draft(_edited("Недоделанная правка"), base_revision=2)

    await service.rollback(1)

    assert (await service.current()).version == 1
    assert [(v.number, v.active) for v in await service.versions()] == [(1, True), (2, False)]
    draft = await service.draft()
    assert draft.data == dump_scenario(await service.by_version(1))
    assert draft.revision == 4
    assert await service.publish() == 3


async def test_rollback_to_missing_version_raises(service):
    with pytest.raises(NotFound):
        await service.rollback(99)

    assert (await service.current()).version == 1


async def test_stale_draft_raises_conflict(service):
    await service.save_draft(_edited("Первая правка"), base_revision=1)

    with pytest.raises(DraftConflict):
        await service.save_draft(_edited("Вторая правка"), base_revision=1)

    assert (await service.draft()).data["steps"]["privacy"]["text"] == "Первая правка"


async def test_concurrent_saves_with_same_base_let_exactly_one_win(service):
    results = await asyncio.gather(
        *(service.save_draft(_edited(f"правка {n}"), base_revision=1) for n in range(8)),
        return_exceptions=True,
    )

    assert sum(isinstance(r, int) for r in results) == 1
    assert sum(isinstance(r, DraftConflict) for r in results) == 7
    assert (await service.draft()).revision == 2


async def test_concurrent_publish_gets_distinct_numbers(db):
    repo = AsyncpgScenarioRepository(db)
    await ScenarioService(repo).ensure_seeded()
    data = dump_scenario(SEED)

    numbers = await asyncio.gather(*(repo.publish(data) for _ in range(6)))

    assert sorted(numbers) == [2, 3, 4, 5, 6, 7]
    assert sum(v.active for v in await repo.list_versions()) == 1


async def test_jsonb_keeps_unicode(service):
    await service.save_draft(_edited("Привет, мир ✅"), base_revision=1)

    assert (await service.draft()).data["steps"]["privacy"]["text"] == "Привет, мир ✅"


# --- сессии и очередь ---


async def test_session_roundtrip(redis):
    repo = RedisSessionRepository(redis)
    session = play(SEED, START + BRANCHES["goods"]).session
    assert await repo.get(session.chat_id) is None

    await repo.save(session)

    assert await repo.get(session.chat_id) == session
    ttl = await redis.ttl(f"session:{session.chat_id}")
    assert SESSION_TTL_SECONDS - 60 < ttl <= SESSION_TTL_SECONDS
    await repo.delete(session.chat_id)
    assert await repo.get(session.chat_id) is None


async def test_session_save_overwrites_and_refreshes(redis):
    repo = RedisSessionRepository(redis)
    first = play(SEED, START).session
    second = replace(play(SEED, START + BRANCHES["both"][:3]).session, username="anna")

    await repo.save(first)
    await repo.save(second)

    assert await repo.get(first.chat_id) == second


async def test_due_returns_only_past(redis):
    queue = RedisReminderQueue(redis)
    now = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
    await queue.schedule(30, now + timedelta(hours=1))
    await queue.schedule(20, now - timedelta(minutes=1))
    await queue.schedule(10, now - timedelta(hours=1))
    await queue.schedule(40, now)

    assert await queue.due(now, limit=10) == [10, 20, 40]
    assert await queue.due(now, limit=2) == [10, 20]


async def test_reschedule_moves_deadline_and_cancel_removes(redis):
    queue = RedisReminderQueue(redis)
    now = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
    await queue.schedule(1, now - timedelta(hours=1))
    await queue.schedule(2, now - timedelta(hours=2))

    await queue.schedule(1, now + timedelta(hours=1))
    await queue.cancel(2)
    await queue.cancel(404)

    assert await queue.due(now, limit=10) == []
    assert await redis.zcard("reminders") == 1

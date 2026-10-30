"""Токены доступа на настоящем Postgres: одноразовость, срок, гонка двух обменов."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from src.access.adapters.asyncpg import AsyncpgAdminRepository, AsyncpgTokenRepository
from src.access.exceptions import InvalidEditorToken
from src.access.services import AccessService

pytestmark = pytest.mark.integration

NOW = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)


@pytest.fixture
def access(db) -> AccessService:
    return AccessService(AsyncpgAdminRepository(db), AsyncpgTokenRepository(db))


async def test_admin_add_is_idempotent(access):
    assert not await access.is_admin(1)

    await access.add_admin(1)
    await access.add_admin(1)

    assert await access.is_admin(1)


async def test_link_is_one_time(access):
    token = await access.issue_link(NOW)

    await access.exchange(token, NOW)

    with pytest.raises(InvalidEditorToken):
        await access.exchange(token, NOW)


async def test_link_expires(access):
    token = await access.issue_link(NOW)

    with pytest.raises(InvalidEditorToken):
        await access.exchange(token, NOW + timedelta(minutes=10))


async def test_session_checked_by_kind_and_time(access):
    link = await access.issue_link(NOW)
    session = await access.exchange(link, NOW)

    await access.check_session(session, NOW + timedelta(hours=23))
    with pytest.raises(InvalidEditorToken):
        await access.check_session(session, NOW + timedelta(hours=24))
    with pytest.raises(InvalidEditorToken):
        await access.check_session(link, NOW)


async def test_parallel_exchange_has_one_winner(access):
    token = await access.issue_link(NOW)

    results = await asyncio.gather(
        *(access.exchange(token, NOW) for _ in range(8)), return_exceptions=True
    )

    assert sum(isinstance(r, str) for r in results) == 1
    assert sum(isinstance(r, InvalidEditorToken) for r in results) == 7


async def test_database_keeps_only_hashes(db, access):
    token = await access.issue_link(NOW)
    session = await access.exchange(token, NOW)

    hashes = {r["token_hash"] for r in await db.pool.fetch("SELECT token_hash FROM editor_tokens")}

    assert len(hashes) == 2
    assert token not in hashes and session not in hashes

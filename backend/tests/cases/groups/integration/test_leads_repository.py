from datetime import UTC, datetime

import pytest

from src.leads.adapters.asyncpg import AsyncpgLeadRepository
from src.leads.entities import Lead, LeadAnswer, LeadStatus
from src.shared.exceptions import NotFound

pytestmark = pytest.mark.integration

NOW = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)


def _lead(**kw) -> Lead:
    base = dict(
        id=None,
        chat_id=1,
        username="ivan",
        branch="Сайт",
        answers=(LeadAnswer("name", "Иван"), LeadAnswer("Телефон", "+70000000000")),
        status=LeadStatus.PARTIAL,
        file_id=None,
        created_at=NOW,
        last_step="phone",
    )
    base.update(kw)
    return Lead(**base)


@pytest.fixture
async def repo(db) -> AsyncpgLeadRepository:
    return AsyncpgLeadRepository(db)


async def test_upsert_keeps_id_and_order_of_answers(repo):
    first = await repo.upsert_open(_lead())
    answers = (LeadAnswer("яблоко", "1"), LeadAnswer("б", "2"), LeadAnswer("aaa", "3"))
    second = await repo.upsert_open(_lead(answers=answers, last_step="x"))

    assert second.id == first.id
    assert second.answers == answers
    assert second.created_at == first.created_at
    assert (await repo.get(first.id)) == second


async def test_full_is_not_overwritten_and_new_pass_creates_new_row(repo):
    partial = await repo.upsert_open(_lead())
    full = await repo.upsert_open(_lead(status=LeadStatus.FULL, last_step=None))
    assert full.id == partial.id and full.status is LeadStatus.FULL

    again = await repo.upsert_open(_lead(branch="Другое"))

    assert again.id != full.id
    assert (await repo.get(full.id)).branch == "Сайт"
    assert (await repo.get(full.id)).status is LeadStatus.FULL


async def test_list_by_status_newest_first_and_get_missing(repo):
    a = await repo.upsert_open(_lead(chat_id=1, status=LeadStatus.FULL))
    b = await repo.upsert_open(_lead(chat_id=2, created_at=datetime(2026, 10, 31, tzinfo=UTC)))

    assert [x.id for x in await repo.list(None)] == [b.id, a.id]
    assert [x.id for x in await repo.list(LeadStatus.PARTIAL)] == [b.id]
    with pytest.raises(NotFound):
        await repo.get(999)

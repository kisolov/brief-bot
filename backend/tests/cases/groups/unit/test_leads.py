import logging
from datetime import UTC, datetime, timedelta

import pytest

from src.leads.adapters.memory import (
    InMemoryLeadRepository,
    MockFileGateway,
    MockManagerNotifier,
)
from src.leads.entities import Lead, LeadAnswer, LeadStatus
from src.leads.formatter import _split, display_key, format_lead
from src.leads.services import LeadService
from src.shared.exceptions import NotFound

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
def repo() -> InMemoryLeadRepository:
    return InMemoryLeadRepository()


@pytest.fixture
def notifier() -> MockManagerNotifier:
    return MockManagerNotifier()


@pytest.fixture
def service(repo, notifier) -> LeadService:
    return LeadService(repo, notifier, MockFileGateway())


async def test_finish_upgrades_partial(service, repo):
    partial = await service.save_partial(_lead())
    full = await service.finish(_lead(status=LeadStatus.PARTIAL, last_step=None))

    assert full.id == partial.id
    assert full.status is LeadStatus.FULL
    assert len(await repo.list(None)) == 1


async def test_full_is_never_overwritten(service, repo):
    first = await service.finish(_lead())
    second = await service.save_partial(_lead(branch="Другое"))

    assert second.id != first.id
    assert (await service.get(first.id)).branch == "Сайт"
    assert len(await repo.list(None)) == 2


async def test_upsert_keeps_id_and_created_at(repo):
    first = await repo.upsert_open(_lead())
    later = await repo.upsert_open(_lead(branch="Другое", created_at=NOW + timedelta(hours=1)))

    assert later.id == first.id
    assert later.branch == "Другое"
    assert later.created_at == NOW


async def test_finish_of_partial_refreshes_created_at(repo):
    first = await repo.upsert_open(_lead())
    done = NOW + timedelta(days=1)

    full = await repo.upsert_open(_lead(status=LeadStatus.FULL, created_at=done))

    assert full.id == first.id
    assert full.created_at == done


async def test_list_filters_by_status_newest_first(service):
    a = await service.finish(_lead(chat_id=1, created_at=NOW))
    b = await service.save_partial(_lead(chat_id=2, created_at=NOW + timedelta(minutes=1)))

    assert [x.id for x in await service.list(None)] == [b.id, a.id]
    assert [x.id for x in await service.list(LeadStatus.FULL)] == [a.id]


async def test_get_missing_raises(service):
    with pytest.raises(NotFound):
        await service.get(999)


async def test_notification_sent_after_save(service, notifier):
    saved = await service.finish(_lead(file_id="F1"))

    assert len(notifier.sent) == 1
    parts, file_id = notifier.sent[0]
    assert file_id == "F1"
    assert parts[0].startswith("Новая заявка")
    assert saved.id is not None


async def test_notifier_failure_keeps_lead(repo, caplog):
    service = LeadService(repo, MockManagerNotifier(fail=True), MockFileGateway())

    with caplog.at_level(logging.ERROR):
        saved = await service.finish(_lead())

    assert (await repo.get(saved.id)).status is LeadStatus.FULL
    record = next(r for r in caplog.records if r.levelno == logging.ERROR)
    assert record.exc_info is not None
    assert record.lead_id == saved.id
    assert "+7000" not in caplog.text and "Иван" not in caplog.text


def test_format_full_lead():
    text = "\n".join(format_lead(_lead(status=LeadStatus.FULL, last_step=None)))

    assert text.splitlines() == [
        "Новая заявка",
        "Направление: Сайт",
        "Telegram: @ivan",
        "Имя: Иван",
        "Телефон: +70000000000",
    ]


def test_format_partial_lead_shows_last_step_and_skips_missing_username():
    lines = "\n".join(format_lead(_lead(username=None))).splitlines()

    assert lines[0] == "Частичная заявка"
    assert not any(line.startswith("Telegram") for line in lines)
    assert "Последний шаг: phone" in lines


def test_display_key():
    assert display_key("name") == "Имя"
    assert display_key("Телефон") == "Телефон"


def _units(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def test_format_splits_long_lead_keeping_lines_intact():
    answers = tuple(LeadAnswer(f"k{i}", "x" * 500) for i in range(12))
    lead = _lead(answers=answers)
    parts = format_lead(lead)

    assert len(parts) > 1
    assert all(_units(p) <= 4096 for p in parts)
    expected = "\n".join(
        ["Частичная заявка", "Направление: Сайт", "Telegram: @ivan", "Последний шаг: phone"]
        + [f"k{i}: {'x' * 500}" for i in range(12)]
    )
    assert "\n".join(parts) == expected


def test_format_hard_cuts_single_long_line():
    parts = format_lead(_lead(answers=(LeadAnswer("о проекте", "y" * 9000),)))

    assert all(_units(p) <= 4096 for p in parts)
    assert "".join(parts).count("y") == 9000


def test_split_part_of_exactly_limit_stays_whole():
    assert _split("a" * 4096) == ["a" * 4096]


def test_split_one_over_limit_makes_two_parts():
    parts = _split("a" * 4097)

    assert [len(p) for p in parts] == [4096, 1]


def test_split_line_boundary_at_limit():
    parts = _split("a" * 4095 + "\nb")

    assert parts == ["a" * 4095, "b"]


def test_split_trailing_newline_gives_no_empty_part():
    assert _split("a" * 4096 + "\n") == ["a" * 4096]


def test_split_never_returns_blank_parts():
    for text in ("a" * 4096 + "\n   ", "a" * 4096 + "\n\n\n", "a\n\n"):
        assert all(p.strip() for p in _split(text))


def test_split_keeps_empty_line_at_junction():
    parts = _split("a" * 4096 + "\n\nb")

    assert parts == ["a" * 4096, "\nb"]


def test_split_emoji_counted_in_utf16_units():
    parts = _split("A\n" + "\U0001f600" * 4000)

    assert len(parts) > 1
    assert all(_units(p) <= 4096 for p in parts)
    assert "".join(parts).replace("\n", "").count("\U0001f600") == 4000


def test_split_emoji_pair_not_torn_on_hard_cut():
    parts = _split("\U0001f600" * 4000)

    for p in parts:
        p.encode("utf-16-le")  # неразорванная пара кодируется без суррогатов-сирот
        assert _units(p) <= 4096
    assert "".join(parts) == "\U0001f600" * 4000


def test_format_multiline_value_and_empty_value():
    lead = _lead(
        username=None,
        branch="",
        status=LeadStatus.FULL,
        last_step=None,
        answers=(LeadAnswer("о проекте", "строка 1\nстрока 2"), LeadAnswer("Сайт", "")),
    )

    assert format_lead(lead) == ["Новая заявка\nо проекте: строка 1\nстрока 2\nСайт: "]

import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from src.dialog.adapters.memory import InMemoryReminderQueue, InMemorySessionRepository
from src.dialog.adapters.redis import session_from_json, session_to_json
from src.dialog.engine import render, step
from src.dialog.entities import Answer, Event, Session
from src.scenario.seed import load_seed
from tests.cases.groups.unit.test_seed_scenario import BRANCHES, START
from tests.utils.walker import play

SEED = load_seed()


def _prefixes(script: list[str]) -> list[Session]:
    return [play(SEED, script[:n]).session for n in range(len(script) + 1)]


@pytest.mark.parametrize("branch", ["goods", "both", "promo", "works"])
def test_roundtrip_equals_real_session_on_every_step(branch):
    for session in _prefixes(START + BRANCHES[branch]):
        assert session_from_json(session_to_json(session)) == session


def test_roundtrip_restores_tuples_and_answer_dataclass():
    sessions = _prefixes(START + BRANCHES["goods"]) + _prefixes(START + BRANCHES["both"])
    # Тест не доказывает ничего, если сценарий не задел сложные поля.
    assert any(s.returns for s in sessions), "сценарий не заходил в блок"
    assert any(a.file_id for s in sessions for a in s.answers.values())
    assert any(a.texts.get("value") for s in sessions for a in s.answers.values())

    for session in sessions:
        restored = session_from_json(session_to_json(session))
        assert type(restored.history) is tuple
        assert type(restored.returns) is tuple
        assert all(type(s) is tuple for s in restored.history_returns)
        assert all(type(s) is tuple for s in restored.history_answers)
        for answer in restored.answers.values():
            assert type(answer) is Answer
            assert type(answer.labels) is tuple
            assert type(answer.ids) is tuple


def test_roundtrip_of_session_waiting_for_option_text():
    pending = [s for s in _prefixes(START + BRANCHES["goods"]) if s.pending_input is not None]
    assert pending, "в сценарии нет ожидания текста опции"

    for session in pending:
        assert session_from_json(session_to_json(session)) == session


def test_roundtrip_keeps_flags_and_username():
    session = replace(play(SEED, START + BRANCHES["promo"]).session, reminded=True, username="anna")
    assert session.finished

    assert session_from_json(session_to_json(session)) == session


def test_json_is_plain_json_text():
    session = play(SEED, START + BRANCHES["promo"][:4]).session

    raw = session_to_json(session)

    assert isinstance(raw, str)
    assert json.loads(raw)["chat_id"] == session.chat_id


def test_old_json_without_snapshots_is_padded_with_current_keys_and_back_keeps_answers():
    session = play(SEED, START + BRANCHES["promo"][:5]).session
    data = json.loads(session_to_json(session))
    del data["history_answers"]
    del data["history_returns"]

    restored = session_from_json(json.dumps(data))

    keys = tuple(session.answers)
    assert len(restored.history) > 2
    assert restored.history_answers == (keys,) * len(restored.history)
    assert restored.history_returns == ((),) * len(restored.history)
    assert render(SEED, restored).can_back
    after = step(SEED, restored, Event("back", step=restored.step)).session
    assert after.step == session.history[-1]
    assert after.history == session.history[:-1]
    assert after.answers == restored.answers
    assert len(after.history_answers) == len(after.history)
    assert len(after.history_returns) == len(after.history)


def test_short_snapshots_are_padded_to_history_length():
    session = play(SEED, START + BRANCHES["promo"][:5]).session
    data = json.loads(session_to_json(session))
    data["history_answers"] = data["history_answers"][:1]

    restored = session_from_json(json.dumps(data))

    assert len(restored.history_answers) == len(restored.history)
    assert restored.history_answers[0] == session.history_answers[0]
    assert restored.history_answers[1:] == (tuple(session.answers),) * (len(restored.history) - 1)


async def test_memory_session_repository_contract():
    repo = InMemorySessionRepository()
    session = play(SEED, START).session

    assert await repo.get(session.chat_id) is None
    await repo.save(session)
    assert await repo.get(session.chat_id) == session
    await repo.delete(session.chat_id)
    assert await repo.get(session.chat_id) is None
    await repo.delete(session.chat_id)


async def test_memory_reminder_queue_due_takes_entries_in_order():
    queue = InMemoryReminderQueue()
    now = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
    await queue.schedule(3, now + timedelta(hours=1))
    await queue.schedule(2, now - timedelta(minutes=1))
    await queue.schedule(1, now - timedelta(hours=1))
    await queue.schedule(4, now - timedelta(minutes=30))

    assert await queue.due(now, limit=2) == [1, 4]
    assert await queue.due(now, limit=10) == [2]
    assert await queue.due(now, limit=10) == []


async def test_memory_reminder_queue_schedule_after_due_and_cancel():
    queue = InMemoryReminderQueue()
    now = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
    await queue.schedule(1, now - timedelta(hours=1))
    await queue.schedule(2, now - timedelta(hours=1))
    assert await queue.due(now, limit=10) == [1, 2]

    await queue.schedule(1, now - timedelta(minutes=1))
    await queue.cancel(2)
    await queue.cancel(404)

    assert await queue.due(now, limit=10) == [1]

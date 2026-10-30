import asyncio
import logging
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta

import pytest

from src.bootstrap.jobs.reminders import run_reminders
from src.dialog.adapters.memory import (
    InMemoryReminderQueue,
    InMemorySessionRepository,
    InMemorySettingsRepository,
)
from src.dialog.entities import Event, ReminderSettings
from src.dialog.exceptions import ChatBlocked
from src.dialog.ports import ChatGateway
from src.dialog.services import DialogService
from src.dialog.usecases.handle_event import HandleEvent
from src.dialog.usecases.resume_or_restart import ResumeOrRestart
from src.dialog.usecases.send_reminders import BATCH_LIMIT, SendReminders
from src.leads.adapters.memory import (
    InMemoryLeadRepository,
    MockFileGateway,
    MockManagerNotifier,
)
from src.leads.entities import LeadStatus
from src.leads.services import LeadService
from src.scenario.adapters.memory import InMemoryScenarioRepository
from src.scenario.parser import dump_scenario
from src.scenario.services import ScenarioService
from tests.utils.sample_scenario import sample_scenario

NOW = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
LATER = NOW + timedelta(hours=4)
CHAT = 100


class FakeGateway(ChatGateway):
    def __init__(self) -> None:
        self.sent: list[tuple[int, str]] = []
        self.blocked: set[int] = set()
        self.broken: set[int] = set()

    async def send_reminder(self, chat_id: int, text: str) -> None:
        if chat_id in self.blocked:
            raise ChatBlocked("заблокирован")
        if chat_id in self.broken:
            raise RuntimeError("сеть")
        self.sent.append((chat_id, text))


@dataclass
class Harness:
    handle: HandleEvent
    resume: ResumeOrRestart
    remind: SendReminders
    sessions: InMemorySessionRepository
    reminders: InMemoryReminderQueue
    settings: InMemorySettingsRepository
    lead_repo: InMemoryLeadRepository
    notifier: MockManagerNotifier
    gateway: FakeGateway

    async def answer_name(self, chat_id: int = CHAT) -> None:
        await self.handle(chat_id, "anna", Event("start"))
        await self.handle(chat_id, "anna", Event("button", step="privacy", value="ok"))
        await self.handle(chat_id, "anna", Event("text", step="name", value="Анна"))


@pytest.fixture
async def h() -> Harness:
    scenario_repo = InMemoryScenarioRepository()
    await scenario_repo.publish(dump_scenario(sample_scenario()))
    sessions = InMemorySessionRepository()
    reminders = InMemoryReminderQueue()
    settings = InMemorySettingsRepository()
    lead_repo = InMemoryLeadRepository()
    notifier = MockManagerNotifier()
    gateway = FakeGateway()
    dialog = DialogService(sessions, reminders, ScenarioService(scenario_repo), settings)
    leads = LeadService(lead_repo, notifier, MockFileGateway())
    return Harness(
        HandleEvent(dialog, leads, clock=lambda: NOW),
        ResumeOrRestart(dialog),
        SendReminders(dialog, leads, gateway),
        sessions,
        reminders,
        settings,
        lead_repo,
        notifier,
        gateway,
    )


async def test_due_session_gets_reminder_and_partial_lead(h):
    await h.answer_name()

    sent = await h.remind(LATER)

    assert sent == 1
    assert h.gateway.sent == [(CHAT, "Вы не закончили анкету. Продолжим с того же места?")]
    leads = await h.lead_repo.list(None)
    assert len(leads) == 1 and leads[0].status is LeadStatus.PARTIAL
    assert leads[0].chat_id == CHAT
    assert len(h.notifier.sent) == 1
    session = await h.sessions.get(CHAT)
    assert session is not None and session.reminded


async def test_reminder_not_due_yet_sends_nothing(h):
    await h.answer_name()

    assert await h.remind(NOW + timedelta(hours=1)) == 0
    assert h.gateway.sent == []


async def test_reminder_sent_once(h):
    await h.answer_name()

    assert await h.remind(LATER) == 1
    assert await h.remind(LATER) == 0
    # Даже если запись вернулась в очередь, флаг session.reminded держит повтор.
    await h.reminders.schedule(CHAT, NOW)
    assert await h.remind(LATER) == 0
    assert len(h.gateway.sent) == 1
    assert len(h.notifier.sent) == 1


async def test_blocked_user_removed_without_error(h, caplog):
    await h.answer_name()
    h.gateway.blocked.add(CHAT)

    with caplog.at_level("INFO"):
        sent = await h.remind(LATER)

    assert sent == 0
    # Блокировка это штатный случай: ни одной ошибки, одна запись INFO.
    assert [r for r in caplog.records if r.levelno >= logging.ERROR] == []
    skipped = [r for r in caplog.records if r.message == "Reminder skipped: chat blocked"]
    assert len(skipped) == 1 and skipped[0].levelno == logging.INFO
    assert skipped[0].chat_id == CHAT
    assert h.gateway.sent == []
    assert await h.reminders.due(LATER, 10) == []


async def test_blocked_user_still_gives_manager_partial(h):
    await h.answer_name()
    h.gateway.blocked.add(CHAT)

    await h.remind(LATER)

    leads = await h.lead_repo.list(None)
    assert len(leads) == 1 and leads[0].status is LeadStatus.PARTIAL
    assert len(h.notifier.sent) == 1
    session = await h.sessions.get(CHAT)
    assert session is not None and session.reminded


async def test_finished_session_not_reminded(h):
    await h.answer_name()
    session = await h.sessions.get(CHAT)
    await h.sessions.save(replace(session, finished=True))
    await h.reminders.schedule(CHAT, NOW)

    assert await h.remind(LATER) == 0
    assert h.gateway.sent == []
    assert await h.lead_repo.list(None) == []


async def test_missing_session_not_reminded(h):
    await h.reminders.schedule(CHAT, NOW)

    assert await h.remind(LATER) == 0
    assert h.gateway.sent == []


async def test_no_answers_not_reminded(h):
    await h.handle(CHAT, "anna", Event("start"))
    await h.reminders.schedule(CHAT, NOW)

    assert await h.remind(LATER) == 0
    assert h.gateway.sent == []
    assert await h.lead_repo.list(None) == []


async def test_branch_only_not_reminded(h):
    await h.handle(CHAT, "anna", Event("start"))
    session = await h.sessions.get(CHAT)
    await h.sessions.save(replace(session, step="branch"))
    await h.handle(CHAT, "anna", Event("button", step="branch", value="new"))
    await h.reminders.schedule(CHAT, NOW)

    assert await h.remind(LATER) == 0
    assert h.gateway.sent == []


async def test_one_chat_failure_does_not_stop_others(h, caplog):
    await h.answer_name(CHAT)
    await h.answer_name(CHAT + 1)
    await h.answer_name(CHAT + 2)
    h.gateway.broken.add(CHAT + 1)

    with caplog.at_level("ERROR"):
        sent = await h.remind(LATER)

    assert sent == 2
    assert sorted(chat for chat, _ in h.gateway.sent) == [CHAT, CHAT + 2]
    failures = [r for r in caplog.records if r.levelname == "ERROR"]
    assert len(failures) == 1
    assert failures[0].chat_id == CHAT + 1
    assert failures[0].exc_info is not None


async def test_handle_event_uses_saved_hours(h):
    await h.settings.save_reminder(ReminderSettings(hours=5, text="Продолжим?"))

    await h.answer_name()

    assert h.reminders._deadlines[CHAT] == NOW + timedelta(hours=5)
    await h.remind(NOW + timedelta(hours=4))
    assert h.gateway.sent == []
    await h.reminders.schedule(CHAT, NOW)
    await h.remind(NOW + timedelta(hours=6))
    assert h.gateway.sent == [(CHAT, "Продолжим?")]


async def test_resume_button_returns_to_same_step(h):
    await h.answer_name()
    await h.remind(LATER)

    screen = await h.resume(CHAT, "continue")

    assert screen.step == "branch"
    session = await h.sessions.get(CHAT)
    assert session is not None and "name" in session.answers and session.reminded


async def test_restart_clears_answers(h):
    await h.answer_name()
    await h.remind(LATER)

    screen = await h.resume(CHAT, "restart")

    assert screen.step == "privacy"
    session = await h.sessions.get(CHAT)
    assert session is not None and session.answers == {} and not session.reminded


async def test_new_attempt_after_reminder_can_be_reminded_again(h):
    await h.answer_name()
    await h.remind(LATER)
    await h.resume(CHAT, "restart")
    await h.handle(CHAT, "anna", Event("button", step="privacy", value="ok"))
    await h.handle(CHAT, "anna", Event("text", step="name", value="Анна"))

    assert await h.remind(NOW + timedelta(hours=8)) == 1


async def test_job_survives_failure_and_stops_on_cancel():
    calls = 0

    class Flaky:
        async def __call__(self, now: datetime) -> int:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("сбой")
            return 0

    task = asyncio.create_task(run_reminders(Flaky(), interval=0.01))  # type: ignore[arg-type]
    await asyncio.sleep(0.1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert calls >= 2


async def test_send_failure_keeps_flag_and_partial_lead(h):
    await h.answer_name()
    h.gateway.broken.add(CHAT)

    sent = await h.remind(LATER)

    assert sent == 0
    session = await h.sessions.get(CHAT)
    assert session is not None and session.reminded
    leads = await h.lead_repo.list(None)
    assert len(leads) == 1 and leads[0].status is LeadStatus.PARTIAL
    # Повтора нет: запись снята, флаг стоит.
    h.gateway.broken.clear()
    await h.reminders.schedule(CHAT, NOW)
    assert await h.remind(LATER) == 0
    assert h.gateway.sent == []


async def test_lead_failure_sends_nothing_and_keeps_flag_false(h):
    await h.answer_name()

    async def boom(lead):
        raise RuntimeError("база недоступна")

    h.remind._leads.save_partial = boom  # type: ignore[method-assign]

    sent = await h.remind(LATER)

    assert sent == 0
    assert h.gateway.sent == []
    session = await h.sessions.get(CHAT)
    assert session is not None and not session.reminded


async def _finish_from_branch(h) -> None:
    await h.handle(CHAT, "anna", Event("button", step="branch", value="old"))
    await h.handle(CHAT, "anna", Event("button", step="promo_now", value="paid"))
    await h.handle(CHAT, "anna", Event("button", step="sphere", value="shop"))
    await h.handle(CHAT, "anna", Event("button", step="extras", value="logo"))
    await h.handle(CHAT, "anna", Event("done", step="extras"))
    await h.handle(CHAT, "anna", Event("text", step="promo_link", value="example.ru"))
    await h.handle(CHAT, "anna", Event("text", step="contact", value="+7 999 111-22-33"))
    await h.handle(CHAT, "anna", Event("file", step="docs", value="FILE1"))
    await h.handle(CHAT, "anna", Event("done", step="ready"))


async def test_finish_after_reminder_upgrades_partial_to_full(h):
    await h.answer_name()
    await h.remind(LATER)

    await _finish_from_branch(h)

    leads = await h.lead_repo.list(None)
    assert len(leads) == 1
    assert leads[0].status is LeadStatus.FULL
    assert h.reminders._deadlines == {}
    assert len(h.notifier.sent) == 2  # частичная и полная
    assert len(h.gateway.sent) == 1


async def test_continue_after_reminder_never_reminds_again(h):
    await h.answer_name()
    await h.remind(LATER)

    screen = await h.resume(CHAT, "continue")
    assert screen.step == "branch"
    await h.handle(CHAT, "anna", Event("button", step="branch", value="old"))

    assert h.reminders._deadlines == {}
    assert await h.remind(NOW + timedelta(days=365)) == 0
    assert len(h.gateway.sent) == 1


async def test_batch_limit_is_respected(h):
    for chat in range(CHAT, CHAT + BATCH_LIMIT + 1):
        await h.answer_name(chat)

    assert await h.remind(LATER) == BATCH_LIMIT
    assert len(h.gateway.sent) == BATCH_LIMIT
    # Лишний чат остался в очереди и уходит со следующим проходом.
    assert await h.remind(LATER) == 1
    assert len({chat for chat, _ in h.gateway.sent}) == BATCH_LIMIT + 1


async def _during_partial(h: Harness, action) -> None:
    """Выполняет action в момент записи частичной заявки: человек пишет прямо сейчас."""
    save_partial = h.remind._leads.save_partial

    async def racing(lead):
        await action()
        return await save_partial(lead)

    h.remind._leads.save_partial = racing  # type: ignore[method-assign]


async def test_reminder_does_not_overwrite_session_changed_during_pass(h):
    await h.answer_name()
    await _during_partial(
        h, lambda: h.handle(CHAT, "anna", Event("button", step="branch", value="new"))
    )

    assert await h.remind(LATER) == 0

    session = await h.sessions.get(CHAT)
    assert session is not None and session.step == "hub"
    assert not session.reminded
    assert h.gateway.sent == []


async def test_reminder_does_not_overwrite_finished_session(h):
    await h.answer_name()
    session = await h.sessions.get(CHAT)

    async def finish():
        await h.sessions.save(replace(session, finished=True))

    await _during_partial(h, finish)

    assert await h.remind(LATER) == 0

    saved = await h.sessions.get(CHAT)
    assert saved is not None and saved.finished and not saved.reminded
    assert h.gateway.sent == []


async def test_reminder_does_not_restore_session_deleted_during_pass(h):
    await h.answer_name()
    await _during_partial(h, lambda: h.sessions.delete(CHAT))

    assert await h.remind(LATER) == 0

    assert await h.sessions.get(CHAT) is None
    assert h.gateway.sent == []

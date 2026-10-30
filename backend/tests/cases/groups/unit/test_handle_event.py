from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta

import pytest

from src.dialog.adapters.memory import (
    InMemoryReminderQueue,
    InMemorySessionRepository,
    InMemorySettingsRepository,
)
from src.dialog.entities import Event
from src.dialog.services import RESUME_STEP, DialogService
from src.dialog.usecases.handle_event import HandleEvent
from src.dialog.usecases.resume_or_restart import ResumeOrRestart
from src.leads.adapters.memory import InMemoryLeadRepository, MockManagerNotifier
from src.leads.entities import LeadStatus
from src.leads.services import LeadService
from src.scenario.adapters.memory import InMemoryScenarioRepository
from src.scenario.parser import dump_scenario
from src.scenario.services import ScenarioService
from tests.utils.sample_scenario import sample_scenario

NOW = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
CHAT = 100


@dataclass
class Harness:
    handle: HandleEvent
    resume: ResumeOrRestart
    dialog: DialogService
    sessions: InMemorySessionRepository
    reminders: InMemoryReminderQueue
    lead_repo: InMemoryLeadRepository
    notifier: MockManagerNotifier
    scenario_repo: InMemoryScenarioRepository

    async def press(self, step: str, option: str):
        return await self.handle(CHAT, "anna", Event("button", step=step, value=option))

    async def write(self, step: str, text: str):
        return await self.handle(CHAT, "anna", Event("text", step=step, value=text))

    async def done(self, step: str):
        return await self.handle(CHAT, "anna", Event("done", step=step))

    async def start(self):
        return await self.handle(CHAT, "anna", Event("start"))

    async def deadline(self):
        return self.reminders._deadlines.get(CHAT)


@pytest.fixture
async def h() -> Harness:
    scenario_repo = InMemoryScenarioRepository()
    await scenario_repo.publish(dump_scenario(sample_scenario()))
    sessions = InMemorySessionRepository()
    reminders = InMemoryReminderQueue()
    lead_repo = InMemoryLeadRepository()
    notifier = MockManagerNotifier()
    dialog = DialogService(
        sessions, reminders, ScenarioService(scenario_repo), InMemorySettingsRepository()
    )
    handle = HandleEvent(dialog, LeadService(lead_repo, notifier), clock=lambda: NOW)
    return Harness(
        handle,
        ResumeOrRestart(dialog),
        dialog,
        sessions,
        reminders,
        lead_repo,
        notifier,
        scenario_repo,
    )


async def _walk_to_finish(h: Harness):
    await h.start()
    await h.press("privacy", "ok")
    await h.write("name", "Анна")
    await h.press("branch", "old")
    await h.press("promo_now", "paid")
    await h.press("sphere", "shop")
    await h.press("extras", "logo")
    await h.done("extras")
    await h.write("promo_link", "example.ru")
    await h.write("contact", "+7 999 111-22-33")
    await h.handle(CHAT, "anna", Event("file", step="docs", value="FILE1"))
    return await h.done("ready")


async def test_finished_saves_full_lead_and_cancels_reminder(h):
    screen = await _walk_to_finish(h)

    assert "Спасибо за заявку, Анна!" in screen.text
    leads = await h.lead_repo.list(None)
    assert len(leads) == 1
    lead = leads[0]
    assert lead.status is LeadStatus.FULL
    assert lead.chat_id == CHAT
    assert lead.username == "anna"
    assert lead.branch == "Продвижение"
    assert lead.file_id == "FILE1"
    assert lead.created_at == NOW
    assert [(a.key, a.value) for a in lead.answers] == [
        ("name", "Анна"),
        ("Продвижение", "Платно"),
        ("Сфера", "Магазин"),
        ("Дополнительно", "Логотип"),
        ("Ссылка", "example.ru"),
        ("Телефон", "+7 999 111-22-33"),
    ]
    assert len(h.notifier.sent) == 1
    assert await h.deadline() is None
    session = await h.sessions.get(CHAT)
    assert session is not None and session.finished


async def test_progress_schedules_reminder_and_keeps_session(h):
    await h.start()
    await h.press("privacy", "ok")
    assert await h.deadline() is None  # ответов с key ещё нет

    await h.write("name", "Анна")

    assert await h.deadline() == NOW + timedelta(hours=3)
    session = await h.sessions.get(CHAT)
    assert session is not None and session.step == "branch"
    assert not session.finished
    assert await h.lead_repo.list(None) == []


async def test_branch_only_does_not_schedule_reminder(h):
    await h.start()
    session = await h.sessions.get(CHAT)
    await h.sessions.save(replace(session, step="branch"))

    await h.press("branch", "new")

    saved = await h.sessions.get(CHAT)
    assert saved is not None and saved.step == "hub" and "branch" in saved.answers
    assert await h.deadline() is None


async def test_reminded_session_is_not_rescheduled(h):
    await h.start()
    await h.press("privacy", "ok")
    session = await h.sessions.get(CHAT)
    await h.sessions.save(replace(session, reminded=True))

    await h.write("name", "Анна")

    assert await h.deadline() is None


async def test_no_effect_does_not_touch_session_or_reminder(h):
    await h.start()
    await h.press("privacy", "ok")
    await h.write("name", "Анна")
    before = await h.sessions.get(CHAT)
    deadline = await h.deadline()

    # Кнопка со старого экрана ничего не меняет.
    screen = await h.press("privacy", "ok")

    assert screen.step == "branch"
    assert await h.sessions.get(CHAT) == before
    assert await h.deadline() == deadline


async def test_session_uses_pinned_version(h):
    await h.start()
    data = dump_scenario(sample_scenario())
    data["steps"]["name"]["text"] = "Новый вопрос про имя"
    assert await h.scenario_repo.publish(data) == 2

    screen = await h.press("privacy", "ok")

    assert screen.text == "Как вас зовут?"
    session = await h.sessions.get(CHAT)
    assert session is not None and session.version == 1


async def test_start_after_finish_uses_current_version(h):
    await _walk_to_finish(h)
    data = dump_scenario(sample_scenario())
    data["steps"]["privacy"]["text"] = "Политика v2"
    await h.scenario_repo.publish(data)

    screen = await h.start()

    assert screen.text == "Политика v2"
    session = await h.sessions.get(CHAT)
    assert session is not None and session.version == 2 and not session.finished


async def test_missing_session_starts_new_for_any_event(h):
    screen = await h.press("branch", "old")  # кнопка из очень старого сообщения
    assert screen.step == "privacy"
    screen = await h.handle(CHAT + 1, None, Event("text", value="привет"))
    assert screen.step == "privacy"


async def test_start_mid_survey_offers_resume(h):
    await h.start()
    await h.press("privacy", "ok")
    await h.write("name", "Анна")
    before = await h.sessions.get(CHAT)

    screen = await h.start()

    assert screen.step == RESUME_STEP
    assert [b.label for b in screen.buttons] == ["Продолжить", "Начать заново"]
    assert not screen.can_back
    assert await h.sessions.get(CHAT) == before  # ответы на месте


async def test_start_without_answers_shows_current_screen(h):
    await h.start()
    await h.press("privacy", "ok")

    screen = await h.start()

    assert screen.step == "name"


async def test_resume_continue_shows_current_screen(h):
    await h.start()
    await h.press("privacy", "ok")
    await h.write("name", "Анна")

    screen = await h.resume(CHAT, "continue")

    assert screen.step == "branch"
    session = await h.sessions.get(CHAT)
    assert session is not None and "name" in session.answers


async def test_resume_restart_creates_new_session_and_cancels_reminder(h):
    await h.start()
    await h.press("privacy", "ok")
    await h.write("name", "Анна")
    assert await h.deadline() is not None

    screen = await h.resume(CHAT, "restart")

    assert screen.step == "privacy"
    session = await h.sessions.get(CHAT)
    assert session is not None and session.answers == {} and session.username == "anna"
    assert await h.deadline() is None


async def test_resume_restart_without_session_starts_new(h):
    screen = await h.resume(CHAT, "restart", "anna")
    assert screen.step == "privacy"
    screen = await h.resume(CHAT + 5, "continue")
    assert screen.step == "privacy"


async def test_lead_failure_keeps_session_on_previous_step(h):
    await h.start()
    await h.press("privacy", "ok")
    await h.write("name", "Анна")
    await h.press("branch", "old")
    await h.press("promo_now", "paid")
    await h.press("sphere", "shop")
    await h.press("extras", "logo")
    await h.done("extras")
    await h.write("promo_link", "example.ru")
    await h.write("contact", "+7 999 111-22-33")
    await h.handle(CHAT, "anna", Event("file", step="docs", value="F"))

    async def boom(lead):
        raise RuntimeError("база недоступна")

    h.handle._leads.finish = boom  # type: ignore[method-assign]
    with pytest.raises(RuntimeError):
        await h.done("ready")

    session = await h.sessions.get(CHAT)
    assert session is not None and session.step == "ready" and not session.finished

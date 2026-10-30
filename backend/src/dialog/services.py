"""Сервис диалога: сессии, напоминания и применение событий на закреплённой версии сценария."""

from dataclasses import replace
from datetime import datetime

from src.dialog.engine import new_session, render, step
from src.dialog.entities import (
    BRANCH_KEY,
    Button,
    Event,
    ReminderSettings,
    Screen,
    Session,
    StepResult,
)
from src.dialog.exceptions import SessionNotFound
from src.dialog.ports import ReminderQueue, SessionRepository, SettingsRepository
from src.scenario.entities import Scenario
from src.scenario.services import ScenarioService
from src.shared.exceptions import NotFound

# Метка экрана возобновления: у него нет шага в сценарии.
RESUME_STEP = "@resume"
RESUME_CONTINUE = "continue"
RESUME_RESTART = "restart"
RESUME_TEXT = "У вас есть незавершённая анкета. Продолжить с того же места или начать заново?"


def resume_screen() -> Screen:
    return Screen(
        step=RESUME_STEP,
        text=RESUME_TEXT,
        buttons=(
            Button(id=RESUME_CONTINUE, label="Продолжить"),
            Button(id=RESUME_RESTART, label="Начать заново"),
        ),
    )


def has_answers(session: Session) -> bool:
    """Есть ли хотя бы один ответ с key: по нему видно, что человек начал анкету."""
    return any(answer.key for answer in session.answers.values())


def has_reminder_progress(session: Session) -> bool:
    """Ответ с key, кроме выбора направления: смотрящему примеры напоминание не нужно."""
    return any(answer.key and answer.key != BRANCH_KEY for answer in session.answers.values())


class DialogService:
    def __init__(
        self,
        sessions: SessionRepository,
        reminders: ReminderQueue,
        scenarios: ScenarioService,
        settings: SettingsRepository,
    ) -> None:
        self._sessions = sessions
        self._reminders = reminders
        self._scenarios = scenarios
        self._settings = settings

    async def load(self, chat_id: int) -> Session | None:
        return await self._sessions.get(chat_id)

    async def save(self, session: Session) -> None:
        await self._sessions.save(session)

    async def scenario_of(self, session: Session) -> Scenario:
        """Версия сценария, закреплённая за сессией."""
        return await self._scenarios.by_version(session.version)

    async def screen(self, session: Session) -> Screen:
        """Экран сессии. Версии нет в базе (восстановили старый дамп): анкета начинается заново."""
        try:
            scenario = await self.scenario_of(session)
        except NotFound:
            return (await self.reset(session.chat_id, session.username)).screen
        return render(scenario, session)

    async def start(self, chat_id: int, username: str | None) -> StepResult:
        """Новая сессия на текущей опубликованной версии; показывает вход."""
        scenario = await self._scenarios.current()
        session = replace(new_session(scenario, chat_id), username=username)
        await self._sessions.save(session)
        return StepResult(session, render(scenario, session))

    async def apply(self, chat_id: int, event: Event, username: str | None = None) -> StepResult:
        """Применяет событие к сохранённой сессии. Сохраняет только запасной вход нового прохода."""
        session = await self._sessions.get(chat_id)
        if session is None:
            raise SessionNotFound(f"сессии чата {chat_id} нет")
        if username is not None:
            session = replace(session, username=username)
        result = step(await self.scenario_of(session), session, event)
        # У завершённой сессии эффект даёт только кнопка финала: это новый проход.
        if session.finished and result.effects:
            return await self._new_passage(session, event, result)
        return result

    async def _new_passage(self, session: Session, event: Event, pinned: StepResult) -> StepResult:
        """Новый проход идёт по текущей версии: та же кнопка того же шага, иначе со входа."""
        latest = await self._scenarios.current()
        if latest.version == session.version:
            return pinned
        if session.step in latest.steps:
            result = step(latest, replace(session, version=latest.version), event)
            if result.effects:
                return result
        return await self.start(session.chat_id, session.username)

    async def reset(self, chat_id: int, username: str | None = None) -> StepResult:
        """Новая сессия вместо старой; напоминание старой снимается."""
        existing = await self._sessions.get(chat_id)
        await self._reminders.cancel(chat_id)
        if username is None and existing is not None:
            username = existing.username
        return await self.start(chat_id, username)

    async def schedule_reminder(self, chat_id: int, at: datetime) -> None:
        await self._reminders.schedule(chat_id, at)

    async def cancel_reminder(self, chat_id: int) -> None:
        await self._reminders.cancel(chat_id)

    async def due_reminders(self, now: datetime, limit: int) -> list[int]:
        """Чаты с наступившим сроком; записи снимаются с очереди при выдаче."""
        return await self._reminders.due(now, limit)

    async def reminder_settings(self) -> ReminderSettings:
        return await self._settings.get_reminder()

    async def save_reminder_settings(self, settings: ReminderSettings) -> None:
        await self._settings.save_reminder(settings)

"""Сценарий: человек что-то нажал или написал, бот отвечает экраном."""

from collections.abc import Callable
from datetime import datetime, timedelta

from src.dialog.entities import Effect, Event, Screen, Session
from src.dialog.lead_builder import build_lead
from src.dialog.services import DialogService, has_answers, has_reminder_progress, resume_screen
from src.leads.entities import LeadStatus
from src.leads.services import LeadService
from src.shared.logger import get_logger

logger = get_logger(__name__)


class HandleEvent:
    def __init__(
        self,
        dialog: DialogService,
        leads: LeadService,
        clock: Callable[[], datetime],
        reminder_hours: int = 3,
    ) -> None:
        self._dialog = dialog
        self._leads = leads
        self._clock = clock
        self._reminder_hours = reminder_hours

    async def __call__(self, chat_id: int, username: str | None, event: Event) -> Screen:
        session = await self._dialog.load(chat_id)
        if session is None or (event.kind == "start" and session.finished):
            started = await self._dialog.start(chat_id, username)
            logger.info(
                "Session started",
                extra={"chat_id": chat_id, "version": started.session.version},
            )
            return started.screen
        if event.kind == "start":
            if has_answers(session):
                return resume_screen()
            return await self._dialog.screen(session)

        result = await self._dialog.apply(chat_id, event, username)
        if Effect.FINISHED in result.effects:
            await self._finish(result.session)
        elif Effect.PROGRESS in result.effects:
            await self._dialog.save(result.session)
            await self._plan_reminder(result.session)
        logger.info(
            "Event handled",
            extra={
                "chat_id": chat_id,
                "event_kind": event.kind,
                "step": result.session.step,
                "finished": result.session.finished,
            },
        )
        return result.screen

    async def _finish(self, session: Session) -> None:
        scenario = await self._dialog.scenario_of(session)
        lead = build_lead(scenario, session, LeadStatus.FULL, self._clock())
        # Заявка пишется до сессии: при сбое базы сессия остаётся прежней, можно повторить.
        await self._leads.finish(lead)
        await self._dialog.cancel_reminder(session.chat_id)
        await self._dialog.save(session)

    async def _plan_reminder(self, session: Session) -> None:
        if not session.reminded and has_reminder_progress(session):
            at = self._clock() + timedelta(hours=self._reminder_hours)
            await self._dialog.schedule_reminder(session.chat_id, at)
        else:
            await self._dialog.cancel_reminder(session.chat_id)

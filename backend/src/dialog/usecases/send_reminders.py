"""Сценарий: напомнить о брошенной анкете и отдать менеджеру частичную заявку."""

from dataclasses import replace
from datetime import datetime

from src.dialog.exceptions import ChatBlocked
from src.dialog.lead_builder import build_lead
from src.dialog.ports import ChatGateway
from src.dialog.services import DialogService, has_reminder_progress
from src.leads.entities import LeadStatus
from src.leads.services import LeadService
from src.shared.logger import get_logger

logger = get_logger(__name__)

# Столько чатов за один проход: остальные подхватит следующая минута.
BATCH_LIMIT = 100


class SendReminders:
    def __init__(self, dialog: DialogService, leads: LeadService, gateway: ChatGateway) -> None:
        self._dialog = dialog
        self._leads = leads
        self._gateway = gateway

    async def __call__(self, now: datetime) -> int:
        """Возвращает число отправленных напоминаний. Сбой одного чата не трогает остальных."""
        sent = 0
        for chat_id in await self._dialog.due_reminders(now, BATCH_LIMIT):
            try:
                if await self._remind(chat_id, now):
                    sent += 1
            except Exception:
                logger.error("Reminder failed", extra={"chat_id": chat_id}, exc_info=True)
        return sent

    async def _remind(self, chat_id: int, now: datetime) -> bool:
        session = await self._dialog.load(chat_id)
        if session is None or session.finished or session.reminded:
            return False
        if not has_reminder_progress(session):
            return False
        scenario = await self._dialog.scenario_of(session)
        lead = build_lead(scenario, session, LeadStatus.PARTIAL, now)
        # Менеджер получает частичную заявку, даже если человек уже заблокировал бота.
        await self._leads.save_partial(lead)
        # За время записи человек мог ответить или закончить: его сессию не затираем.
        if await self._dialog.load(chat_id) != session:
            logger.info("Reminder skipped: session changed", extra={"chat_id": chat_id})
            return False
        # Флаг до отправки: при сбое отправки второе напоминание не уйдёт.
        await self._dialog.save(replace(session, reminded=True))
        settings = await self._dialog.reminder_settings()
        try:
            await self._gateway.send_reminder(chat_id, settings.text)
        except ChatBlocked:
            logger.info("Reminder skipped: chat blocked", extra={"chat_id": chat_id})
            return False
        logger.info("Reminder sent", extra={"chat_id": chat_id})
        return True

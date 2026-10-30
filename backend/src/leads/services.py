"""Сервис заявок: сначала запись, потом уведомление менеджера."""

from dataclasses import replace

from src.leads.entities import Lead, LeadStatus
from src.leads.formatter import format_lead
from src.leads.ports import LeadRepository, ManagerNotifier
from src.shared.logger import get_logger

logger = get_logger(__name__)


class LeadService:
    def __init__(self, repository: LeadRepository, notifier: ManagerNotifier) -> None:
        self._repository = repository
        self._notifier = notifier

    async def save_partial(self, lead: Lead) -> Lead:
        return await self._save_and_notify(replace(lead, status=LeadStatus.PARTIAL))

    async def finish(self, lead: Lead) -> Lead:
        return await self._save_and_notify(replace(lead, status=LeadStatus.FULL))

    async def list(self, status: LeadStatus | None) -> list[Lead]:
        return await self._repository.list(status)

    async def get(self, id: int) -> Lead:
        return await self._repository.get(id)

    async def _save_and_notify(self, lead: Lead) -> Lead:
        saved = await self._repository.upsert_open(lead)
        try:
            await self._notifier.send(format_lead(saved), saved.file_id)
        except Exception:
            # Заявка уже записана: сбой Telegram не должен её терять или ронять диалог.
            logger.error(
                "Manager notification failed",
                extra={"lead_id": saved.id, "status": saved.status.value},
                exc_info=True,
            )
        return saved

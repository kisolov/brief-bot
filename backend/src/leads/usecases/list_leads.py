"""Сценарий: список заявок для редактора."""

from src.leads.entities import Lead, LeadStatus
from src.leads.services import LeadService


class ListLeads:
    def __init__(self, leads: LeadService) -> None:
        self._leads = leads

    async def __call__(self, status: LeadStatus | None) -> list[Lead]:
        return await self._leads.list(status)

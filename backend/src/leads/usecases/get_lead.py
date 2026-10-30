"""Сценарий: карточка заявки для редактора."""

from src.leads.entities import Lead
from src.leads.services import LeadService


class GetLead:
    def __init__(self, leads: LeadService) -> None:
        self._leads = leads

    async def __call__(self, id: int) -> Lead:
        return await self._leads.get(id)

"""Сценарий: скачивание файла ТЗ заявки."""

from src.leads.services import LeadService


class DownloadLeadFile:
    def __init__(self, leads: LeadService) -> None:
        self._leads = leads

    async def __call__(self, id: int) -> bytes:
        return await self._leads.download_file(id)

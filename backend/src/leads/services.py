"""Сервис заявок: сначала запись, потом уведомление менеджера."""

import re
from dataclasses import replace
from pathlib import PurePosixPath

from src.leads.entities import Lead, LeadFile, LeadStatus
from src.leads.formatter import format_lead
from src.leads.ports import FileGateway, LeadRepository, ManagerNotifier
from src.shared.exceptions import NotFound
from src.shared.logger import get_logger

logger = get_logger(__name__)

# Имя пришло из Telegram и уходит в заголовок: всё лишнее отбрасывается вместе с суффиксом.
_SAFE_SUFFIX = re.compile(r"[a-zA-Z0-9.]{1,10}")


class LeadService:
    def __init__(
        self, repository: LeadRepository, notifier: ManagerNotifier, files: FileGateway
    ) -> None:
        self._repository = repository
        self._notifier = notifier
        self._files = files

    async def save_partial(self, lead: Lead) -> Lead:
        return await self._save_and_notify(replace(lead, status=LeadStatus.PARTIAL))

    async def finish(self, lead: Lead) -> Lead:
        return await self._save_and_notify(replace(lead, status=LeadStatus.FULL))

    async def list(self, status: LeadStatus | None) -> list[Lead]:
        return await self._repository.list(status)

    async def get(self, id: int) -> Lead:
        return await self._repository.get(id)

    async def download_file(self, id: int) -> LeadFile:
        """Файл ТЗ заявки с именем tz-<id><суффикс>.

        NotFound, если заявки или файла нет; FileTooLarge при лимите Telegram.
        """
        lead = await self._repository.get(id)
        if lead.file_id is None:
            raise NotFound(f"у заявки {id} нет файла")
        stored = await self._files.download(lead.file_id)
        suffix = PurePosixPath(stored.name).suffix
        safe = suffix if _SAFE_SUFFIX.fullmatch(suffix) else ""
        return LeadFile(f"tz-{id}{safe}", stored.content)

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

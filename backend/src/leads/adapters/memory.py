"""Хранилище заявок и шлюз менеджера в памяти для тестов и локального запуска."""

from dataclasses import replace

from src.leads.entities import Lead, LeadStatus
from src.leads.ports import FileGateway, LeadRepository, ManagerNotifier
from src.shared.exceptions import NotFound


class InMemoryLeadRepository(LeadRepository):
    def __init__(self) -> None:
        self._leads: dict[int, Lead] = {}
        self._next_id = 1

    async def upsert_open(self, lead: Lead) -> Lead:
        existing = next(
            (
                x
                for x in self._leads.values()
                if x.chat_id == lead.chat_id and x.status is LeadStatus.PARTIAL
            ),
            None,
        )
        if existing is not None:
            saved = replace(lead, id=existing.id, created_at=existing.created_at)
        else:
            saved = replace(lead, id=self._next_id)
            self._next_id += 1
        self._leads[saved.id] = saved
        return saved

    async def list(self, status: LeadStatus | None) -> list[Lead]:
        found = [x for x in self._leads.values() if status is None or x.status is status]
        return sorted(found, key=lambda x: (x.created_at, x.id), reverse=True)

    async def get(self, id: int) -> Lead:
        if id not in self._leads:
            raise NotFound(f"заявки {id} нет")
        return self._leads[id]


class MockManagerNotifier(ManagerNotifier):
    """Запоминает отправленное; fail=True имитирует сбой Telegram."""

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.sent: list[tuple[list[str], str | None]] = []

    async def send(self, chat_parts: list[str], file_id: str | None) -> None:
        if self.fail:
            raise RuntimeError("менеджерский чат недоступен")
        self.sent.append((chat_parts, file_id))


class MockFileGateway(FileGateway):
    """Файлы по file_id; errors задаёт исключение, которое бросит скачивание."""

    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}
        self.errors: dict[str, Exception] = {}

    async def download(self, file_id: str) -> bytes:
        if file_id in self.errors:
            raise self.errors[file_id]
        if file_id not in self.files:
            raise NotFound(f"файла {file_id} нет")
        return self.files[file_id]

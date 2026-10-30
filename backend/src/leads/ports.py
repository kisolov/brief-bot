"""Порты заявок: хранилище и исходящий шлюз к менеджеру."""

from abc import ABC, abstractmethod

from src.leads.entities import Lead, LeadStatus


class LeadRepository(ABC):
    @abstractmethod
    async def upsert_open(self, lead: Lead) -> Lead:
        """Обновляет открытую (partial) заявку чата, сохраняя id и created_at, иначе вставляет.

        Заявка full не перезаписывается никогда: новый проход после финала даёт новую запись.
        Возвращает сохранённую заявку.
        """

    @abstractmethod
    async def list(self, status: LeadStatus | None) -> list[Lead]:
        """Новые первыми. status=None: все."""

    @abstractmethod
    async def get(self, id: int) -> Lead:
        """NotFound, если заявки нет."""


class FileGateway(ABC):
    @abstractmethod
    async def download(self, file_id: str) -> bytes:
        """Содержимое файла по file_id. FileTooLarge, если файл не отдаётся ботом."""


class ManagerNotifier(ABC):
    @abstractmethod
    async def send(self, chat_parts: list[str], file_id: str | None) -> None:
        """Шлёт менеджеру текст частями и, если есть file_id, пересылает файл ТЗ."""

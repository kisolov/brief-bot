"""Порты хранения сценария."""

from abc import ABC, abstractmethod

from src.scenario.entities import Draft, Scenario, VersionInfo


class ScenarioRepository(ABC):
    @abstractmethod
    async def get_published(self) -> Scenario:
        """Активная версия. NotFound, пока ни одна не опубликована."""

    @abstractmethod
    async def get_version(self, n: int) -> Scenario:
        """NotFound, если версии нет."""

    @abstractmethod
    async def list_versions(self) -> list[VersionInfo]:
        """По возрастанию номера."""

    @abstractmethod
    async def get_draft(self) -> Draft:
        """NotFound, пока хранилище не заполнено сидом."""

    @abstractmethod
    async def save_draft(self, data: dict, base_revision: int) -> int:
        """Атомарно сохраняет, если revision всё ещё base_revision. Иначе DraftConflict."""

    @abstractmethod
    async def publish(self, data: dict) -> int:
        """Записывает данные новой версией с номером max+1 и делает её активной."""

    @abstractmethod
    async def activate_version(self, n: int) -> None:
        """Откат: атомарно делает версию n активной и заменяет черновик её данными.

        revision черновика растёт. NotFound, если версии нет; при сбое не меняется ничего.
        """

    @abstractmethod
    async def seed(self, data: dict) -> bool:
        """Если версий нет: версия 1 (активная) и черновик, revision 1. False, если заполнено."""

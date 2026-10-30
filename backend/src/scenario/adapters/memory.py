"""Хранилище сценария в памяти для тестов и локального запуска."""

import copy
from datetime import UTC, datetime

from src.scenario.entities import Draft, Scenario, VersionInfo
from src.scenario.exceptions import DraftConflict
from src.scenario.parser import parse_scenario
from src.scenario.ports import ScenarioRepository
from src.shared.exceptions import NotFound


class InMemoryScenarioRepository(ScenarioRepository):
    def __init__(self) -> None:
        self._versions: dict[int, tuple[dict, datetime]] = {}
        self._active: int | None = None
        self._draft: Draft | None = None

    async def get_published(self) -> Scenario:
        if self._active is None:
            raise NotFound("нет опубликованной версии сценария")
        return await self.get_version(self._active)

    async def get_version(self, n: int) -> Scenario:
        if n not in self._versions:
            raise NotFound(f"версии {n} нет")
        return parse_scenario(self._versions[n][0], version=n)

    async def list_versions(self) -> list[VersionInfo]:
        return [
            VersionInfo(number=n, published_at=at, active=n == self._active)
            for n, (_, at) in sorted(self._versions.items())
        ]

    async def get_draft(self) -> Draft:
        if self._draft is None:
            raise NotFound("черновика нет")
        return Draft(copy.deepcopy(self._draft.data), self._draft.revision)

    async def save_draft(self, data: dict, base_revision: int) -> int:
        if self._draft is None or self._draft.revision != base_revision:
            raise DraftConflict("черновик изменён")
        self._draft = Draft(copy.deepcopy(data), base_revision + 1)
        return self._draft.revision

    async def replace_draft(self, data: dict) -> int:
        revision = self._draft.revision + 1 if self._draft else 1
        self._draft = Draft(copy.deepcopy(data), revision)
        return revision

    async def publish(self, data: dict) -> int:
        number = max(self._versions, default=0) + 1
        self._versions[number] = (copy.deepcopy(data), datetime.now(UTC))
        self._active = number
        return number

    async def set_active(self, n: int) -> None:
        if n not in self._versions:
            raise NotFound(f"версии {n} нет")
        self._active = n

    async def seed(self, data: dict) -> bool:
        if self._versions:
            return False
        await self.publish(data)
        self._draft = Draft(copy.deepcopy(data), 1)
        return True

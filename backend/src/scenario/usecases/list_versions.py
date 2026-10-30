"""Сценарий: список опубликованных версий."""

from src.scenario.entities import VersionInfo
from src.scenario.services import ScenarioService


class ListVersions:
    def __init__(self, scenarios: ScenarioService) -> None:
        self._scenarios = scenarios

    async def __call__(self) -> list[VersionInfo]:
        return await self._scenarios.versions()

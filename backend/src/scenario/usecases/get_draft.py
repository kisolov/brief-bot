"""Сценарий: прочитать черновик в редакторе."""

from src.scenario.entities import Draft
from src.scenario.services import ScenarioService


class GetDraft:
    def __init__(self, scenarios: ScenarioService) -> None:
        self._scenarios = scenarios

    async def __call__(self) -> Draft:
        return await self._scenarios.draft()

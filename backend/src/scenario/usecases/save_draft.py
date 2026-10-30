"""Сценарий: автосохранение черновика; DraftConflict, если его успели изменить."""

from src.scenario.services import ScenarioService


class SaveDraft:
    def __init__(self, scenarios: ScenarioService) -> None:
        self._scenarios = scenarios

    async def __call__(self, data: dict, revision: int) -> int:
        return await self._scenarios.save_draft(data, revision)

"""Сценарий: первый запуск кладёт сценарий из ТЗ в хранилище."""

from src.scenario.services import ScenarioService
from src.shared.logger import get_logger

logger = get_logger(__name__)


class EnsureSeeded:
    def __init__(self, scenarios: ScenarioService) -> None:
        self._scenarios = scenarios

    async def __call__(self) -> bool:
        seeded = await self._scenarios.ensure_seeded()
        if seeded:
            logger.info("Scenario seeded")
        return seeded

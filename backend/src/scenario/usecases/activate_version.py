"""Сценарий: откат на опубликованную версию."""

from src.scenario.services import ScenarioService
from src.shared.logger import get_logger

logger = get_logger(__name__)


class ActivateVersion:
    def __init__(self, scenarios: ScenarioService) -> None:
        self._scenarios = scenarios

    async def __call__(self, number: int) -> None:
        await self._scenarios.rollback(number)
        logger.info("Scenario version activated", extra={"version": number})

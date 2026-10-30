"""Сценарий: публикация черновика. ScenarioInvalid оставляет бота на старой версии."""

from src.scenario.services import ScenarioService
from src.shared.logger import get_logger

logger = get_logger(__name__)


class PublishScenario:
    def __init__(self, scenarios: ScenarioService) -> None:
        self._scenarios = scenarios

    async def __call__(self) -> int:
        version = await self._scenarios.publish()
        logger.info("Scenario published", extra={"version": version})
        return version

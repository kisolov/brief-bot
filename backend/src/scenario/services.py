"""Сценарий: черновик, публикация с проверкой, откат версий."""

from src.scenario.entities import Draft, Scenario, VersionInfo
from src.scenario.exceptions import ScenarioInvalid, ScenarioMalformed
from src.scenario.parser import dump_scenario, parse_scenario
from src.scenario.ports import ScenarioRepository
from src.scenario.seed import load_seed
from src.scenario.validator import Issue, validate_scenario

# Номер версии нужен парсеру, но настоящий известен только после записи.
_CANDIDATE_VERSION = 0


class ScenarioService:
    def __init__(self, repository: ScenarioRepository) -> None:
        self._repo = repository

    async def current(self) -> Scenario:
        return await self._repo.get_published()

    async def by_version(self, n: int) -> Scenario:
        return await self._repo.get_version(n)

    async def draft(self) -> Draft:
        return await self._repo.get_draft()

    async def save_draft(self, data: dict, base_revision: int) -> int:
        return await self._repo.save_draft(data, base_revision)

    async def versions(self) -> list[VersionInfo]:
        return await self._repo.list_versions()

    async def publish(self) -> int:
        """Публикует черновик. Невалидный сценарий не меняет версию: ScenarioInvalid."""
        draft = await self._repo.get_draft()
        try:
            candidate = parse_scenario(draft.data, version=_CANDIDATE_VERSION)
        except ScenarioMalformed as exc:
            # Черновик может быть любым JSON, поэтому разбор тоже даёт обычный список проблем.
            raise ScenarioInvalid([Issue("malformed", "", None, str(exc))]) from exc
        issues = validate_scenario(candidate)
        if issues:
            raise ScenarioInvalid(issues)
        return await self._repo.publish(draft.data)

    async def rollback(self, n: int) -> None:
        """Делает версию n активной; черновик становится её копией, отменённое не остаётся."""
        await self._repo.activate_version(n)

    async def ensure_seeded(self) -> bool:
        """Первый запуск: сценарий из ТЗ становится версией 1 и черновиком."""
        return await self._repo.seed(dump_scenario(load_seed()))

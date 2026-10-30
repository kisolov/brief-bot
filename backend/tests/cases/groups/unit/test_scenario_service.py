import pytest

from src.scenario.adapters.memory import InMemoryScenarioRepository
from src.scenario.exceptions import DraftConflict, ScenarioInvalid, ScenarioMalformed
from src.scenario.parser import dump_scenario, parse_scenario
from src.scenario.seed import load_seed
from src.scenario.services import ScenarioService
from src.shared.exceptions import NotFound

SEED_DATA = dump_scenario(load_seed())


@pytest.fixture
async def service() -> ScenarioService:
    svc = ScenarioService(InMemoryScenarioRepository())
    await svc.ensure_seeded()
    return svc


def _edited(text: str) -> dict:
    data = dump_scenario(load_seed())
    data["steps"]["privacy"]["text"] = text
    return data


def _broken() -> dict:
    data = dump_scenario(load_seed())
    data["entry"] = "net_takogo_shaga"
    return data


async def test_seed_writes_version_one_and_draft(service):
    current = await service.current()
    draft = await service.draft()
    versions = await service.versions()

    assert current == load_seed()
    assert [(v.number, v.active) for v in versions] == [(1, True)]
    assert draft.data == SEED_DATA
    assert draft.revision == 1


async def test_ensure_seeded_is_noop_on_filled_storage(service):
    await service.save_draft(_edited("Правка"), base_revision=1)

    assert await service.ensure_seeded() is False

    assert (await service.draft()).revision == 2
    assert len(await service.versions()) == 1


async def test_publish_valid_bumps_version(service):
    await service.save_draft(_edited("Новый текст"), base_revision=1)

    number = await service.publish()

    assert number == 2
    current = await service.current()
    assert current.version == 2
    assert current.steps["privacy"].text == "Новый текст"
    assert [(v.number, v.active) for v in await service.versions()] == [(1, False), (2, True)]
    assert (await service.by_version(1)).steps["privacy"].text != "Новый текст"


async def test_publish_invalid_raises_and_keeps_version(service):
    await service.save_draft(_broken(), base_revision=1)

    with pytest.raises(ScenarioInvalid) as caught:
        await service.publish()

    assert "missing_target" in {i.code for i in caught.value.issues}
    assert (await service.current()).version == 1
    assert [(v.number, v.active) for v in await service.versions()] == [(1, True)]


async def test_publish_malformed_draft_becomes_single_issue(service):
    await service.save_draft({"steps": {}}, base_revision=1)
    with pytest.raises(ScenarioMalformed) as parse_error:
        parse_scenario({"steps": {}}, version=0)

    with pytest.raises(ScenarioInvalid) as caught:
        await service.publish()

    [issue] = caught.value.issues
    assert (issue.code, issue.step_id, issue.option_id) == ("malformed", "", None)
    assert issue.message == str(parse_error.value) != ""
    assert (await service.current()).version == 1


async def test_rollback_sets_active_and_replaces_draft(service):
    await service.save_draft(_edited("Вторая версия"), base_revision=1)
    await service.publish()
    await service.save_draft(_edited("Недоделанная правка"), base_revision=2)

    await service.rollback(1)

    assert (await service.current()).version == 1
    assert [(v.number, v.active) for v in await service.versions()] == [(1, True), (2, False)]
    draft = await service.draft()
    assert draft.data == dump_scenario(await service.by_version(1))
    assert draft.revision == 4


async def test_publish_after_rollback_takes_next_number(service):
    await service.save_draft(_edited("Вторая версия"), base_revision=1)
    await service.publish()
    await service.rollback(1)

    assert await service.publish() == 3
    assert (await service.current()).version == 3


async def test_rollback_to_missing_version_raises_and_keeps_state(service):
    with pytest.raises(NotFound):
        await service.rollback(99)

    assert (await service.current()).version == 1
    assert (await service.draft()).revision == 1


async def test_stale_draft_raises_conflict(service):
    await service.save_draft(_edited("Первая правка"), base_revision=1)

    with pytest.raises(DraftConflict):
        await service.save_draft(_edited("Вторая правка"), base_revision=1)

    assert (await service.draft()).data["steps"]["privacy"]["text"] == "Первая правка"


async def test_draft_revision_grows_on_every_save(service):
    first = await service.save_draft(_edited("а"), base_revision=1)
    second = await service.save_draft(_edited("б"), base_revision=first)

    assert (first, second) == (2, 3)
    assert (await service.draft()).revision == 3


async def test_unknown_version_raises_not_found(service):
    with pytest.raises(NotFound):
        await service.by_version(7)

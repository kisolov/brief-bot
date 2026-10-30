"""Эндпойнты сценария: черновик, публикация, версии."""

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Response

from src.bootstrap.di import Container
from src.bootstrap.utils.session import require_session
from src.scenario.schema import (
    DraftDto,
    PublishedDto,
    RevisionDto,
    SaveDraftDto,
    VersionDto,
)
from src.scenario.usecases.activate_version import ActivateVersion
from src.scenario.usecases.get_draft import GetDraft
from src.scenario.usecases.list_versions import ListVersions
from src.scenario.usecases.publish_scenario import PublishScenario
from src.scenario.usecases.save_draft import SaveDraft

router = APIRouter(prefix="/api/scenario", dependencies=[Depends(require_session)])


@router.get("/draft")
@inject
async def get_draft(
    usecase: GetDraft = Depends(Provide[Container.get_draft]),
) -> DraftDto:
    return DraftDto.from_domain(await usecase())


@router.put("/draft")
@inject
async def save_draft(
    body: SaveDraftDto,
    usecase: SaveDraft = Depends(Provide[Container.save_draft]),
) -> RevisionDto:
    return RevisionDto(revision=await usecase(body.data, body.revision))


@router.post("/publish")
@inject
async def publish(
    usecase: PublishScenario = Depends(Provide[Container.publish_scenario]),
) -> PublishedDto:
    return PublishedDto(version=await usecase())


@router.get("/versions")
@inject
async def list_versions(
    usecase: ListVersions = Depends(Provide[Container.list_versions]),
) -> list[VersionDto]:
    return [VersionDto.from_domain(info) for info in await usecase()]


@router.post("/versions/{number}/activate", status_code=204)
@inject
async def activate_version(
    number: int,
    usecase: ActivateVersion = Depends(Provide[Container.activate_version]),
) -> Response:
    await usecase(number)
    return Response(status_code=204)

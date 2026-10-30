"""Эндпойнты заявок: список, карточка, файл ТЗ."""

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Query, Response

from src.bootstrap.di import Container
from src.bootstrap.utils.session import require_session
from src.leads.entities import LeadStatus
from src.leads.schema import LeadDto
from src.leads.usecases.download_lead_file import DownloadLeadFile
from src.leads.usecases.get_lead import GetLead
from src.leads.usecases.list_leads import ListLeads

router = APIRouter(prefix="/api/leads", dependencies=[Depends(require_session)])


@router.get("")
@inject
async def list_leads(
    status: LeadStatus | None = Query(default=None),
    usecase: ListLeads = Depends(Provide[Container.list_leads]),
) -> list[LeadDto]:
    return [LeadDto.from_domain(lead) for lead in await usecase(status)]


@router.get("/{id}")
@inject
async def get_lead(
    id: int,
    usecase: GetLead = Depends(Provide[Container.get_lead]),
) -> LeadDto:
    return LeadDto.from_domain(await usecase(id))


@router.get("/{id}/file")
@inject
async def download_file(
    id: int,
    usecase: DownloadLeadFile = Depends(Provide[Container.download_lead_file]),
) -> Response:
    file = await usecase(id)
    return Response(
        content=file.content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file.name}"'},
    )

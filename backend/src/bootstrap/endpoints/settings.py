"""Эндпойнты настроек напоминания."""

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from src.bootstrap.di import Container
from src.bootstrap.utils.session import require_session
from src.dialog.schema import ReminderSettingsDto
from src.dialog.usecases.get_reminder_settings import GetReminderSettings
from src.dialog.usecases.save_reminder_settings import SaveReminderSettings

router = APIRouter(prefix="/api/settings", dependencies=[Depends(require_session)])


@router.get("/reminder")
@inject
async def get_reminder(
    usecase: GetReminderSettings = Depends(Provide[Container.get_reminder_settings]),
) -> ReminderSettingsDto:
    return ReminderSettingsDto.from_domain(await usecase())


@router.put("/reminder")
@inject
async def save_reminder(
    body: ReminderSettingsDto,
    usecase: SaveReminderSettings = Depends(Provide[Container.save_reminder_settings]),
) -> ReminderSettingsDto:
    return ReminderSettingsDto.from_domain(await usecase(body.to_domain()))

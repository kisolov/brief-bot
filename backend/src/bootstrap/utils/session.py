"""Зависимость FastAPI: запрос допускается только с действующей cookie редактора."""

from dependency_injector.wiring import Provide, inject
from fastapi import Cookie, Depends

from src.access.exceptions import InvalidEditorToken
from src.access.usecases.check_editor_session import CheckEditorSession
from src.bootstrap.di import Container

COOKIE_NAME = "editor_session"


@inject
async def require_session(
    editor_session: str | None = Cookie(default=None),
    check: CheckEditorSession = Depends(Provide[Container.check_editor_session]),
) -> None:
    if editor_session is None:
        raise InvalidEditorToken("нет cookie сессии")
    await check(editor_session)

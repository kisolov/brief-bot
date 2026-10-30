"""Единственное место, где доменные ошибки превращаются в HTTP-ответы."""

from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse

from src.access.exceptions import InvalidEditorToken, NotAdmin
from src.leads.exceptions import FileTooLarge
from src.scenario.exceptions import DraftConflict, ScenarioInvalid
from src.scenario.schema import IssueDto
from src.shared.exceptions import DomainException, NotFound
from src.shared.logger import get_logger

logger = get_logger(__name__)

Handler = Callable[[Request, Exception], Awaitable[JSONResponse]]


def _log(exc: Exception, request: Request) -> None:
    logger.warning(
        "Business rejection",
        extra={"exception": exc.__class__.__name__, "path": request.url.path},
    )


def http_exception_wrapper(status_code: int) -> Handler:
    async def handler(request: Request, exc: Exception) -> JSONResponse:
        _log(exc, request)
        return JSONResponse(status_code=status_code, content={"detail": str(exc)})

    return handler


async def scenario_invalid_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ScenarioInvalid)
    _log(exc, request)
    issues = [IssueDto.from_domain(issue).model_dump(by_alias=True) for issue in exc.issues]
    return JSONResponse(status_code=422, content={"issues": issues})


exception_handlers: dict[type[DomainException], Handler] = {
    DraftConflict: http_exception_wrapper(409),
    ScenarioInvalid: scenario_invalid_handler,
    NotFound: http_exception_wrapper(404),
    InvalidEditorToken: http_exception_wrapper(401),
    NotAdmin: http_exception_wrapper(403),
    FileTooLarge: http_exception_wrapper(413),
}

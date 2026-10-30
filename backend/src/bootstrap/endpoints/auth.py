"""POST /api/auth/exchange: одноразовая ссылка меняется на cookie сессии."""

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Response

from src.access.services import SESSION_TTL
from src.access.usecases.exchange_token import ExchangeToken
from src.bootstrap.di import Container
from src.bootstrap.utils.session import COOKIE_NAME
from src.shared.base_camel_model import CamelModel

router = APIRouter(prefix="/api/auth")


class ExchangeDto(CamelModel):
    token: str


@router.post("/exchange", status_code=204)
@inject
async def exchange(
    body: ExchangeDto,
    exchange_token: ExchangeToken = Depends(Provide[Container.exchange_token]),
) -> Response:
    session = await exchange_token(body.token)
    response = Response(status_code=204)
    response.set_cookie(
        COOKIE_NAME,
        session,
        max_age=int(SESSION_TTL.total_seconds()),
        path="/",
        httponly=True,
        secure=True,
        samesite="lax",
    )
    return response

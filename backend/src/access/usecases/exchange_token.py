"""Сценарий: одноразовая ссылка меняется на сессию редактора."""

from collections.abc import Callable
from datetime import datetime

from src.access.services import AccessService
from src.shared.logger import get_logger

logger = get_logger(__name__)


class ExchangeToken:
    def __init__(self, access: AccessService, clock: Callable[[], datetime]) -> None:
        self._access = access
        self._clock = clock

    async def __call__(self, token: str) -> str:
        session = await self._access.exchange(token, self._clock())
        logger.info("Editor session started")
        return session

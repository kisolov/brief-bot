"""Сценарий: проверка cookie сессии на каждом запросе API."""

from collections.abc import Callable
from datetime import datetime

from src.access.services import AccessService


class CheckEditorSession:
    def __init__(self, access: AccessService, clock: Callable[[], datetime]) -> None:
        self._access = access
        self._clock = clock

    async def __call__(self, token: str) -> None:
        await self._access.check_session(token, self._clock())

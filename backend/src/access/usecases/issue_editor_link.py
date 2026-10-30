"""Сценарий: ссылка на редактор для администратора или для владельца кода приглашения."""

import secrets
from collections.abc import Callable
from datetime import datetime

from pydantic import SecretStr

from src.access.exceptions import NotAdmin
from src.access.services import AccessService
from src.shared.logger import get_logger

logger = get_logger(__name__)


class IssueEditorLink:
    def __init__(
        self,
        access: AccessService,
        base_url: str,
        invite_code: SecretStr,
        clock: Callable[[], datetime],
    ) -> None:
        self._access = access
        self._base_url = base_url
        self._invite_code = invite_code
        self._clock = clock

    async def __call__(self, telegram_id: int, code: str | None) -> str:
        if not await self._access.is_admin(telegram_id):
            if code is None or not self._invite_matches(code):
                raise NotAdmin("не администратор и нет верного кода приглашения")
            await self._access.add_admin(telegram_id)
            logger.info("Admin added by invite code", extra={"telegram_id": telegram_id})
        token = await self._access.issue_link(self._clock())
        logger.info("Editor link issued", extra={"telegram_id": telegram_id})
        return f"{self._base_url}/login?token={token}"

    def _invite_matches(self, code: str) -> bool:
        # Байты: compare_digest над str падает на не-ASCII, а чужой ввод может быть любым.
        expected = self._invite_code.get_secret_value().encode()
        return secrets.compare_digest(code.encode(), expected)

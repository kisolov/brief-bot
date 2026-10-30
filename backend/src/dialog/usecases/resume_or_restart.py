"""Сценарий: ответ на вопрос "продолжить или начать заново"."""

from typing import Literal

from src.dialog.entities import Screen
from src.dialog.services import DialogService
from src.shared.logger import get_logger

logger = get_logger(__name__)


class ResumeOrRestart:
    def __init__(self, dialog: DialogService) -> None:
        self._dialog = dialog

    async def __call__(
        self,
        chat_id: int,
        choice: Literal["continue", "restart"],
        username: str | None = None,
    ) -> Screen:
        session = await self._dialog.load(chat_id)
        if choice == "continue" and session is not None:
            return await self._dialog.screen(session)
        result = await self._dialog.reset(chat_id, username)
        logger.info("Session restarted", extra={"chat_id": chat_id})
        return result.screen

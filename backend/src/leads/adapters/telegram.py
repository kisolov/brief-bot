"""Уведомление менеджера через Telegram-бота."""

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest

from src.leads.ports import ManagerNotifier


class TelegramManagerNotifier(ManagerNotifier):
    def __init__(self, bot: Bot, chat_id: int) -> None:
        self._bot = bot
        self._chat_id = chat_id

    async def send(self, chat_parts: list[str], file_id: str | None) -> None:
        # Последовательно: порядок частей виден менеджеру в чате.
        for part in chat_parts:
            await self._bot.send_message(self._chat_id, part, parse_mode=None)
        if file_id is None:
            return
        try:
            await self._bot.send_document(self._chat_id, file_id)
        except TelegramBadRequest:
            # file_id фото нельзя отправить как документ.
            await self._bot.send_photo(self._chat_id, file_id)

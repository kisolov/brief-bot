"""Уведомление менеджера через Telegram-бота."""

import io
from pathlib import PurePosixPath

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest

from src.leads.entities import LeadFile
from src.leads.exceptions import FileTooLarge
from src.leads.ports import FileGateway, ManagerNotifier

# Telegram не отдаёт боту файлы крупнее 20 МБ.
MAX_FILE_BYTES = 20 * 1024 * 1024


class TelegramFileGateway(FileGateway):
    def __init__(self, bot: Bot) -> None:
        self._bot = bot

    async def download(self, file_id: str) -> LeadFile:
        try:
            info = await self._bot.get_file(file_id)
        except TelegramBadRequest as exc:
            if "file is too big" in str(exc):
                raise FileTooLarge("файл больше 20 МБ") from exc
            raise
        if info.file_size is not None and info.file_size > MAX_FILE_BYTES:
            raise FileTooLarge("файл больше 20 МБ")
        if info.file_path is None:
            raise FileTooLarge("Telegram не отдаёт путь к файлу")
        buffer = io.BytesIO()
        await self._bot.download_file(info.file_path, destination=buffer)
        return LeadFile(PurePosixPath(info.file_path).name, buffer.getvalue())


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

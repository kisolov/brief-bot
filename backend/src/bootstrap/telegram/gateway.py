"""Отправка напоминания в чат через Telegram."""

from dataclasses import replace

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError

from src.bootstrap.telegram.render import build_markup
from src.dialog.exceptions import ChatBlocked
from src.dialog.ports import ChatGateway
from src.dialog.services import resume_screen


class TelegramChatGateway(ChatGateway):
    def __init__(self, bot: Bot) -> None:
        self._bot = bot

    async def send_reminder(self, chat_id: int, text: str) -> None:
        # Те же кнопки, что у экрана возобновления: r:continue и r:restart.
        screen = replace(resume_screen(), text=text)
        try:
            await self._bot.send_message(
                chat_id, text, reply_markup=build_markup(screen), parse_mode=None
            )
        except TelegramForbiddenError as exc:
            raise ChatBlocked(f"чат {chat_id} закрыт для бота") from exc
        except TelegramBadRequest as exc:
            if "chat not found" in exc.message:
                raise ChatBlocked(f"чата {chat_id} нет") from exc
            raise

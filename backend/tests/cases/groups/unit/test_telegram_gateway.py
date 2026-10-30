from unittest.mock import AsyncMock

import pytest
from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.methods import SendMessage, TelegramMethod

from src.bootstrap.telegram.gateway import TelegramChatGateway
from src.dialog.exceptions import ChatBlocked

TEXT = "Вы не закончили анкету. Продолжим с того же места?"


def _gateway(error: Exception | None = None) -> tuple[TelegramChatGateway, list[TelegramMethod]]:
    bot = Bot(token="123456:TEST-token")
    calls: list[TelegramMethod] = []

    async def make_request(_bot, method, timeout=None):
        calls.append(method)
        if error is not None:
            raise error
        return True

    bot.session.make_request = AsyncMock(side_effect=make_request)
    return TelegramChatGateway(bot), calls


def _method() -> SendMessage:
    return SendMessage(chat_id=7, text=TEXT)


async def test_forbidden_becomes_chat_blocked():
    gateway, _ = _gateway(
        TelegramForbiddenError(_method(), "Forbidden: bot was blocked by the user")
    )

    with pytest.raises(ChatBlocked):
        await gateway.send_reminder(7, TEXT)


async def test_chat_not_found_becomes_chat_blocked():
    gateway, _ = _gateway(TelegramBadRequest(_method(), "Bad Request: chat not found"))

    with pytest.raises(ChatBlocked):
        await gateway.send_reminder(7, TEXT)


async def test_other_bad_request_propagates():
    error = TelegramBadRequest(_method(), "Bad Request: message is too long")
    gateway, _ = _gateway(error)

    with pytest.raises(TelegramBadRequest) as caught:
        await gateway.send_reminder(7, TEXT)

    assert not isinstance(caught.value, ChatBlocked)
    assert caught.value is error


async def test_send_carries_text_and_resume_keyboard_without_parse_mode():
    gateway, calls = _gateway()

    await gateway.send_reminder(7, TEXT)

    assert len(calls) == 1
    method = calls[0]
    assert isinstance(method, SendMessage)
    assert method.chat_id == 7
    assert method.text == TEXT
    assert method.parse_mode is None
    rows = method.reply_markup.inline_keyboard
    assert [(b.text, b.callback_data) for row in rows for b in row] == [
        ("Продолжить", "r:continue"),
        ("Начать заново", "r:restart"),
    ]

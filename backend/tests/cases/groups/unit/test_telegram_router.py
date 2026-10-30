"""Роутер целиком: апдейт Telegram в диспетчер, исходящие вызовы перехвачены в сессии бота."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from aiogram import Bot
from aiogram.methods import (
    AnswerCallbackQuery,
    EditMessageReplyMarkup,
    SendMessage,
    TelegramMethod,
)
from aiogram.types import (
    CallbackQuery,
    Chat,
    Message,
    MessageEntity,
    Update,
    User,
)

from src.bootstrap.di import Container

CHAT = Chat(id=7, type="private")
USER = User(id=7, is_bot=False, first_name="Анна", username="anna")


def _message(text: str, entities: list[MessageEntity] | None = None) -> Message:
    return Message(
        message_id=1,
        date=datetime.now(UTC),
        chat=CHAT,
        from_user=USER,
        text=text,
        entities=entities,
    )


def _reply(method: TelegramMethod):
    if isinstance(method, SendMessage):
        return _message(method.text)
    return True


@pytest.fixture
async def stand():
    container = Container()
    container.scenario_repository.override(container.memory_scenario_repository)
    container.session_repository.override(container.memory_session_repository)
    container.reminder_queue.override(container.memory_reminder_queue)
    container.lead_repository.override(container.memory_lead_repository)
    container.manager_notifier.override(container.mock_manager_notifier)
    await container.scenario_service().ensure_seeded()
    bot = Bot(token="123456:TEST-token")
    calls: list[TelegramMethod] = []

    async def make_request(_bot, method, timeout=None):
        calls.append(method)
        return _reply(method)

    bot.session.make_request = AsyncMock(side_effect=make_request)
    yield container.dispatcher(), bot, calls
    await bot.session.close()


async def _feed(stand, update: Update) -> None:
    dispatcher, bot, _ = stand
    await dispatcher.feed_update(bot, update)


async def test_start_shows_privacy_screen(stand):
    _, _, calls = stand
    command = _message("/start", [MessageEntity(type="bot_command", offset=0, length=6)])

    await _feed(stand, Update(update_id=1, message=command))

    (sent,) = calls
    assert isinstance(sent, SendMessage)
    assert "Перед началом" in sent.text
    assert sent.parse_mode is None
    callbacks = [b.callback_data for row in sent.reply_markup.inline_keyboard for b in row]
    assert "s:privacy:o:start" in callbacks


async def test_button_press_clears_old_keyboard_and_sends_next_screen(stand):
    _, _, calls = stand
    command = _message("/start", [MessageEntity(type="bot_command", offset=0, length=6)])
    await _feed(stand, Update(update_id=1, message=command))
    calls.clear()
    query = CallbackQuery(
        id="q1",
        from_user=USER,
        chat_instance="c",
        message=_message("старый экран"),
        data="s:privacy:o:start",
    )

    await _feed(stand, Update(update_id=2, callback_query=query))

    assert [type(c) for c in calls] == [AnswerCallbackQuery, EditMessageReplyMarkup, SendMessage]


async def test_foreign_callback_is_only_answered(stand):
    _, _, calls = stand
    query = CallbackQuery(
        id="q1", from_user=USER, chat_instance="c", message=_message("x"), data="чужое"
    )

    await _feed(stand, Update(update_id=1, callback_query=query))

    assert [type(c) for c in calls] == [AnswerCallbackQuery]


async def test_unhandled_error_replies_to_user(stand):
    dispatcher, bot, calls = stand
    router = dispatcher.sub_routers[0]
    # Ломаем сам обработчик: эмулируем сбой хранилища внутри usecase.
    handler = router.message.handlers[-1]
    original = handler.callback

    async def broken(*args, **kwargs):
        raise RuntimeError("сбой")

    handler.callback = broken
    try:
        await _feed(stand, Update(update_id=1, message=_message("привет")))
    finally:
        handler.callback = original

    (sent,) = calls
    assert isinstance(sent, SendMessage)
    assert sent.text == "Что-то пошло не так. Попробуйте ещё раз."
    assert sent.chat_id == CHAT.id

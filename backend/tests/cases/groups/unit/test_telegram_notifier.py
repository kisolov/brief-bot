from unittest.mock import AsyncMock, MagicMock

from aiogram.exceptions import TelegramBadRequest

from src.leads.adapters.telegram import TelegramManagerNotifier

MANAGER = -1001


async def test_parts_go_in_order_then_document():
    bot = AsyncMock()
    notifier = TelegramManagerNotifier(bot, MANAGER)

    await notifier.send(["часть 1", "часть 2"], "FILE")

    texts = [c.args[1] for c in bot.send_message.await_args_list]
    assert texts == ["часть 1", "часть 2"]
    assert all(c.args[0] == MANAGER for c in bot.send_message.await_args_list)
    assert all(c.kwargs["parse_mode"] is None for c in bot.send_message.await_args_list)
    bot.send_document.assert_awaited_once_with(MANAGER, "FILE")
    bot.send_photo.assert_not_awaited()


async def test_photo_file_id_falls_back_to_send_photo():
    bot = AsyncMock()
    bot.send_document.side_effect = TelegramBadRequest(
        method=MagicMock(), message="Bad Request: wrong file identifier"
    )
    notifier = TelegramManagerNotifier(bot, MANAGER)

    await notifier.send(["текст"], "PHOTO")

    bot.send_photo.assert_awaited_once_with(MANAGER, "PHOTO")


async def test_no_file_sends_text_only():
    bot = AsyncMock()

    await TelegramManagerNotifier(bot, MANAGER).send(["текст"], None)

    bot.send_document.assert_not_awaited()
    bot.send_photo.assert_not_awaited()

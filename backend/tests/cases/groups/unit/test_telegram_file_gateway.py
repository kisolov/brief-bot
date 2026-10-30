from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import File

from src.leads.adapters.telegram import MAX_FILE_BYTES, TelegramFileGateway
from src.leads.exceptions import FileTooLarge


def _bot(size: int | None, content: bytes = b"data") -> AsyncMock:
    bot = AsyncMock()
    bot.get_file.return_value = File(
        file_id="f", file_unique_id="u", file_size=size, file_path="docs/f.pdf"
    )

    async def download_file(path, destination=None, **_):
        destination.write(content)

    bot.download_file.side_effect = download_file
    return bot


async def test_downloads_small_file():
    bot = _bot(10, b"hello")

    data = await TelegramFileGateway(bot).download("f")

    assert data == b"hello"
    bot.get_file.assert_awaited_once_with("f")


async def test_file_over_limit_is_refused_without_download():
    bot = _bot(MAX_FILE_BYTES + 1)

    with pytest.raises(FileTooLarge):
        await TelegramFileGateway(bot).download("f")

    bot.download_file.assert_not_awaited()


async def test_file_at_limit_is_downloaded():
    assert await TelegramFileGateway(_bot(MAX_FILE_BYTES)).download("f") == b"data"


async def test_telegram_file_is_too_big_error_becomes_file_too_large():
    bot = AsyncMock()
    bot.get_file.side_effect = TelegramBadRequest(
        method=MagicMock(), message="Bad Request: file is too big"
    )

    with pytest.raises(FileTooLarge):
        await TelegramFileGateway(bot).download("f")


async def test_other_bad_request_is_not_swallowed():
    bot = AsyncMock()
    bot.get_file.side_effect = TelegramBadRequest(
        method=MagicMock(), message="Bad Request: wrong file_id"
    )

    with pytest.raises(TelegramBadRequest):
        await TelegramFileGateway(bot).download("f")

"""Сервер без прямого доступа к Telegram: запросы бота идут через прокси из настроек."""

import pytest

from src.bootstrap.di import _init_bot
from src.bootstrap.settings import TelegramSettings


def _settings(proxy: str | None) -> TelegramSettings:
    return TelegramSettings(token="123:abc", manager_chat_id=1, invite_code="code", proxy=proxy)


@pytest.mark.parametrize("proxy", ["socks5://u:p@10.0.0.1:1080", "http://u:p@10.0.0.1:3128"])
async def test_bot_goes_through_proxy(proxy):
    bots = _init_bot(_settings(proxy))
    bot = await anext(bots)
    assert bot.session.proxy == proxy
    await bots.aclose()


@pytest.mark.parametrize("proxy", [None, "", "   "])
async def test_no_proxy_means_direct_connection(proxy):
    # compose отдаёт незаданную переменную пустой строкой
    bots = _init_bot(_settings(proxy))
    bot = await anext(bots)
    assert bot.session.proxy is None
    await bots.aclose()


def test_proxy_is_hidden_in_repr():
    assert "u:p" not in repr(_settings("socks5://u:p@10.0.0.1:1080"))

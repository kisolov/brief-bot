from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.exceptions import TelegramBadRequest

from src.bootstrap.telegram.callback import (
    pack_back,
    pack_button,
    pack_done,
    unpack,
    unpack_resume,
)
from src.bootstrap.telegram.render import build_markup, reply_screen, update_screen
from src.bootstrap.telegram.router import handle_error, message_event
from src.dialog.entities import Button, Event, Screen
from src.dialog.services import resume_screen
from src.scenario.seed import load_seed


def _bad_request(text: str) -> TelegramBadRequest:
    return TelegramBadRequest(method=MagicMock(), message=text)


def _message() -> AsyncMock:
    return AsyncMock()


def _rows(screen: Screen) -> list[list[tuple[str, str | None, str | None]]]:
    markup = build_markup(screen)
    return [[(b.text, b.callback_data, b.url) for b in row] for row in markup.inline_keyboard]


# --- callback_data ---


def test_callback_roundtrip():
    assert unpack(pack_button("menu", "new")) == Event("button", step="menu", value="new")
    assert unpack(pack_done("cat")) == Event("done", step="cat")
    assert unpack(pack_back("cat")) == Event("back", step="cat")
    assert unpack_resume("r:continue") == "continue"
    assert unpack_resume("r:restart") == "restart"


def test_foreign_callback_data_is_none():
    for data in ("", "x", "s:menu", "s:menu:o:", "s:Menu:d", "s:menu:o:a b", "r:other", "s:a:d:x"):
        assert unpack(data) is None
    assert unpack("r:continue") is None
    assert unpack_resume("s:menu:d") is None
    assert unpack_resume("r:") is None


def test_longest_seed_callback_fits_64_bytes():
    scenario = load_seed()
    longest = 0
    for step in scenario.steps.values():
        longest = max(longest, len(pack_done(step.id).encode()), len(pack_back(step.id).encode()))
        for option in step.options:
            data = pack_button(step.id, option.id)
            assert unpack(data) == Event("button", step=step.id, value=option.id)
            longest = max(longest, len(data.encode()))
    assert 0 < longest <= 64


def test_worst_case_ids_fit_64_bytes():
    assert len(pack_button("a" * 24, "b" * 24).encode()) <= 64


# --- клавиатура ---


def test_markup_options_checked_done_and_back():
    screen = Screen(
        step="cat",
        text="Что нужно?",
        buttons=(
            Button("a1", "Товары", checked=True),
            Button("a2", "Услуги"),
            Button("site", "Сайт", url="https://example.ru"),
        ),
        can_done=True,
        can_back=True,
        done_label="Готово",
    )

    assert _rows(screen) == [
        [("✅ Товары", "s:cat:o:a1", None)],
        [("Услуги", "s:cat:o:a2", None)],
        [("Сайт", None, "https://example.ru")],
        [("Готово", "s:cat:d", None)],
        [("⬅️ Назад", "s:cat:b", None)],
    ]


def test_markup_checked_prefix_does_not_enter_callback():
    screen = Screen(step="s", text="t", buttons=(Button("o", "Очень длинная подпись" * 5, True),))
    (row,) = _rows(screen)
    assert row[0][1] == "s:s:o:o"


def test_markup_done_label_and_no_back():
    screen = Screen(step="info", text="t", can_done=True, done_label="Продолжить")
    assert _rows(screen) == [[("Продолжить", "s:info:d", None)]]


def test_markup_resume_screen():
    assert _rows(resume_screen()) == [
        [("Продолжить", "r:continue", None)],
        [("Начать заново", "r:restart", None)],
    ]


# --- отправка ---


async def test_not_modified_is_swallowed():
    message = _message()
    message.edit_text.side_effect = _bad_request("Bad Request: message is not modified")

    await update_screen(message, Screen(step="s", text="t", edit=True))

    message.answer.assert_not_awaited()


async def test_edit_failure_that_cannot_be_edited_sends_new_message():
    message = _message()
    message.edit_text.side_effect = _bad_request("Bad Request: message can't be edited")

    await update_screen(message, Screen(step="s", text="t", edit=True))

    message.answer.assert_awaited_once()


async def test_other_edit_errors_propagate():
    message = _message()
    message.edit_text.side_effect = _bad_request("Bad Request: chat not found")

    with pytest.raises(TelegramBadRequest):
        await update_screen(message, Screen(step="s", text="t", edit=True))


async def test_edit_uses_plain_text():
    message = _message()

    await update_screen(message, Screen(step="s", text="a < b_c", edit=True))

    kwargs = message.edit_text.await_args.kwargs
    assert message.edit_text.await_args.args == ("a < b_c",)
    assert kwargs["parse_mode"] is None


async def test_new_screen_clears_old_keyboard_and_sends_message():
    message = _message()

    await update_screen(message, Screen(step="s", text="t", edit=False))

    message.edit_reply_markup.assert_awaited_once_with(reply_markup=None)
    message.answer.assert_awaited_once()
    assert message.answer.await_args.kwargs["parse_mode"] is None


async def test_keyboard_clear_failure_does_not_block_new_message():
    message = _message()
    message.edit_reply_markup.side_effect = _bad_request("Bad Request: message can't be edited")

    await update_screen(message, Screen(step="s", text="t", edit=False))

    message.answer.assert_awaited_once()


async def test_reply_screen_sends_without_touching_old_message():
    message = _message()

    await reply_screen(message, Screen(step="s", text="t"))

    message.answer.assert_awaited_once()
    message.edit_reply_markup.assert_not_awaited()


# --- апдейты ---


def test_message_event_text_document_photo_and_empty():
    assert message_event(SimpleNamespace(text="Привет", document=None, photo=None)) == Event(
        "text", value="Привет"
    )
    doc = SimpleNamespace(file_id="DOC")
    assert message_event(SimpleNamespace(text=None, document=doc, photo=None)) == Event(
        "file", value="DOC"
    )
    photos = [SimpleNamespace(file_id="small"), SimpleNamespace(file_id="big")]
    assert message_event(SimpleNamespace(text=None, document=None, photo=photos)) == Event(
        "file", value="big"
    )
    assert message_event(SimpleNamespace(text=None, document=None, photo=None)) == Event(
        "text", value=""
    )


async def test_error_handler_replies_without_details(caplog):
    bot = AsyncMock()
    update = SimpleNamespace(
        callback_query=None,
        message=SimpleNamespace(chat=SimpleNamespace(id=42)),
    )
    event = SimpleNamespace(update=update, exception=RuntimeError("секрет +7 999"))

    with caplog.at_level("ERROR"):
        assert await handle_error(event, bot) is True

    bot.send_message.assert_awaited_once()
    assert bot.send_message.await_args.args[1] == "Что-то пошло не так. Попробуйте ещё раз."
    record = next(r for r in caplog.records if r.levelname == "ERROR")
    assert record.chat_id == 42
    assert record.exc_info is not None
    assert "+7 999" not in record.getMessage()


async def test_keyboard_clear_not_modified_is_silent(caplog):
    message = _message()
    message.edit_reply_markup.side_effect = _bad_request("Bad Request: message is not modified")

    with caplog.at_level("WARNING"):
        await update_screen(message, Screen(step="s", text="t", edit=False))

    message.answer.assert_awaited_once()
    assert not [r for r in caplog.records if r.levelname == "WARNING"]


def test_message_event_command_is_empty_text():
    assert message_event(SimpleNamespace(text="/help", document=None, photo=None)) == Event(
        "text", value=""
    )

"""Экран в Telegram: клавиатура и отправка. Тексты уходят без разметки (parse_mode=None)."""

from aiogram.exceptions import TelegramBadRequest
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

from src.bootstrap.telegram.callback import pack_back, pack_button, pack_done, pack_resume
from src.dialog.entities import Screen
from src.dialog.services import RESUME_STEP
from src.shared.logger import get_logger

logger = get_logger(__name__)

CHECKED_PREFIX = "✅ "
BACK_LABEL = "⬅️ Назад"

# Фразы Telegram, когда сообщение нельзя исправить и остаётся отправить новое.
_CANNOT_EDIT = (
    "message can't be edited",
    "message to edit not found",
    "there is no text in the message to edit",
)


def build_markup(screen: Screen) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    resume = screen.step == RESUME_STEP
    for button in screen.buttons:
        if button.url is not None:
            rows.append([InlineKeyboardButton(text=button.label, url=button.url)])
            continue
        data = pack_resume(button.id) if resume else pack_button(screen.step, button.id)
        label = f"{CHECKED_PREFIX}{button.label}" if button.checked else button.label
        rows.append([InlineKeyboardButton(text=label, callback_data=data)])
    if screen.can_done:
        rows.append(
            [InlineKeyboardButton(text=screen.done_label, callback_data=pack_done(screen.step))]
        )
    if screen.can_back:
        rows.append([InlineKeyboardButton(text=BACK_LABEL, callback_data=pack_back(screen.step))])
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def reply_screen(message: Message, screen: Screen) -> None:
    """Новое сообщение с экраном; старое не трогаем (ответ на команду или напоминание)."""
    await message.answer(screen.text, reply_markup=build_markup(screen), parse_mode=None)


async def update_screen(message: Message, screen: Screen) -> None:
    """Экран в ответ на нажатие: правит то же сообщение или присылает новое."""
    if screen.edit:
        await _edit(message, screen)
        return
    await _clear_keyboard(message)
    await reply_screen(message, screen)


async def _edit(message: Message, screen: Screen) -> None:
    try:
        await message.edit_text(screen.text, reply_markup=build_markup(screen), parse_mode=None)
    except TelegramBadRequest as exc:
        if "message is not modified" in exc.message:
            return
        if any(phrase in exc.message for phrase in _CANNOT_EDIT):
            await reply_screen(message, screen)
            return
        raise


async def _clear_keyboard(message: Message) -> None:
    try:
        await message.edit_reply_markup(reply_markup=None)
    except TelegramBadRequest:
        # Старое сообщение могло исчезнуть или не редактироваться: новый экран важнее.
        logger.warning("Keyboard removal failed", exc_info=True)

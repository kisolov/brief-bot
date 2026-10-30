"""Роутер aiogram: превращает апдейт в Event и вызывает usecase. Логики диалога здесь нет."""

from typing import Any

from aiogram import Bot, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import CallbackQuery, ErrorEvent, Message

from src.access.exceptions import NotAdmin
from src.access.usecases.issue_editor_link import IssueEditorLink
from src.bootstrap.telegram.callback import unpack, unpack_resume
from src.bootstrap.telegram.render import reply_screen, update_screen
from src.dialog.entities import Event
from src.dialog.usecases.handle_event import HandleEvent
from src.dialog.usecases.resume_or_restart import ResumeOrRestart
from src.shared.logger import get_logger

logger = get_logger(__name__)

ERROR_TEXT = "Что-то пошло не так. Попробуйте ещё раз."
NOT_ADMIN_TEXT = "Эта команда только для администраторов."
EDITOR_LINK_TEXT = "Ссылка на редактор: {link}\nОна действует 10 минут и срабатывает один раз."


def message_event(message: Any) -> Event:
    """Текст, документ или фото (наибольший размер) в Event; прочее и команды это пустой текст."""
    if message.text:
        # Команда не ответ анкеты: пустой текст заставит движок повторить экран.
        if message.text.startswith("/"):
            return Event("text", value="")
        return Event("text", value=message.text)
    if message.document is not None:
        return Event("file", value=message.document.file_id)
    if message.photo:
        return Event("file", value=message.photo[-1].file_id)
    return Event("text", value="")


def _chat_id(update: Any) -> int | None:
    callback = getattr(update, "callback_query", None)
    if callback is not None and callback.message is not None:
        return callback.message.chat.id
    message = getattr(update, "message", None)
    return message.chat.id if message is not None else None


async def handle_error(event: ErrorEvent, bot: Bot) -> bool:
    """Любое необработанное исключение: в лог с chat_id, человеку короткая фраза."""
    chat_id = _chat_id(event.update)
    logger.error("Update handling failed", extra={"chat_id": chat_id}, exc_info=event.exception)
    if chat_id is not None:
        try:
            await bot.send_message(chat_id, ERROR_TEXT)
        except Exception:
            logger.error("Error reply failed", extra={"chat_id": chat_id}, exc_info=True)
    return True


def build_router(
    handle_event: HandleEvent,
    resume_or_restart: ResumeOrRestart,
    issue_editor_link: IssueEditorLink,
) -> Router:
    router = Router()

    @router.message(CommandStart())
    async def on_start(message: Message) -> None:
        username = message.from_user.username if message.from_user else None
        screen = await handle_event(message.chat.id, username, Event("start"))
        await reply_screen(message, screen)

    @router.message(Command("editor"))
    async def on_editor(message: Message, command: CommandObject) -> None:
        # Сессию анкеты не трогаем: команда не ответ и не шаг.
        if message.from_user is None:
            await message.answer(NOT_ADMIN_TEXT)
            return
        code = command.args.strip() if command.args else None
        try:
            link = await issue_editor_link(message.from_user.id, code or None)
        except NotAdmin:
            await message.answer(NOT_ADMIN_TEXT)
            return
        await message.answer(EDITOR_LINK_TEXT.format(link=link))

    @router.callback_query()
    async def on_callback(callback: CallbackQuery) -> None:
        # Отвечаем всегда, в том числе на чужие данные: иначе кнопка крутится.
        await callback.answer()
        if not isinstance(callback.message, Message) or callback.data is None:
            return
        chat_id = callback.message.chat.id
        username = callback.from_user.username
        choice = unpack_resume(callback.data)
        if choice is not None:
            screen = await resume_or_restart(chat_id, choice, username)
            await update_screen(callback.message, screen)
            return
        event = unpack(callback.data)
        if event is None:
            return
        screen = await handle_event(chat_id, username, event)
        await update_screen(callback.message, screen)

    @router.message()
    async def on_message(message: Message) -> None:
        username = message.from_user.username if message.from_user else None
        screen = await handle_event(message.chat.id, username, message_event(message))
        await reply_screen(message, screen)

    router.errors.register(handle_error)
    return router

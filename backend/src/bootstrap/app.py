"""Точка входа: FastAPI-приложение, внутри которого живёт опрос Telegram."""

import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from aiogram import Bot, Dispatcher
from fastapi import FastAPI

from src.bootstrap.di import Container
from src.bootstrap.di import container as default_container
from src.bootstrap.jobs.reminders import run_reminders
from src.shared.logger import get_logger
from src.shared.migrate import MIGRATIONS_DIR, apply_migrations

logger = get_logger(__name__)


async def _poll(dispatcher: Dispatcher, bot: Bot) -> None:
    """Опрос Telegram. Апдейты по очереди: двойное нажатие не гонит чтение и запись сессии."""
    try:
        await dispatcher.start_polling(
            bot, handle_as_tasks=False, handle_signals=False, close_bot_session=False
        )
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.error("Polling stopped", exc_info=True)


def create_app(container: Container = default_container) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Настройки первыми: неверная конфигурация падает до подключения к базам.
        settings = container.telegram_settings()
        tasks: list[asyncio.Task[None]] = []
        try:
            await container.init_resources()
            db = await container.asyncpg_db()
            await apply_migrations(db.pool, MIGRATIONS_DIR)
            ensure_seeded = await container.ensure_seeded()
            await ensure_seeded()
            if settings.polling_enabled:
                dispatcher = await container.dispatcher()
                bot = await container.bot()
                tasks.append(asyncio.create_task(_poll(dispatcher, bot)))
                send_reminders = await container.send_reminders()
                tasks.append(asyncio.create_task(run_reminders(send_reminders)))
                logger.info("Polling and reminders started")
            yield
        finally:
            for task in tasks:
                task.cancel()
            for task in tasks:
                with contextlib.suppress(asyncio.CancelledError):
                    await task
            await container.shutdown_resources()

    app = FastAPI(lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()

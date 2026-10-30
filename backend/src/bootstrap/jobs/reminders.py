"""Фоновая задача: раз в минуту отправляет напоминания о брошенных анкетах."""

import asyncio
from datetime import UTC, datetime

from src.dialog.usecases.send_reminders import SendReminders
from src.shared.logger import get_logger

logger = get_logger(__name__)

INTERVAL_SECONDS = 60


async def run_reminders(send_reminders: SendReminders, interval: float = INTERVAL_SECONDS) -> None:
    """Цикл до отмены. Сбой прохода пишется в лог и не останавливает задачу."""
    while True:
        try:
            await send_reminders(datetime.now(UTC))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.error("Reminder pass failed", exc_info=True)
        await asyncio.sleep(interval)

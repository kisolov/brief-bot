"""Ссылка входа в редактор для разработки: сквозная проверка и снимки экрана без Telegram.

Приложение этот файл не импортирует. Запуск из каталога backend:

    uv run python -m scripts.dev_editor_link [telegram_id]

Нужны те же переменные окружения, что у приложения, и уже применённые миграции
(их применяет первый старт uvicorn). Печатает только ссылку на одной строке.
"""

import asyncio
import sys

from src.bootstrap.di import container

# Условный администратор: в базу попадает как обычный админ, настоящего аккаунта за ним нет.
DEFAULT_TELEGRAM_ID = 1


async def main(telegram_id: int) -> str:
    await container.init_resources()
    try:
        invite_code = container.telegram_settings().invite_code.get_secret_value()
        issue_editor_link = await container.issue_editor_link()
        # Верный код приглашения делает пользователя администратором, если он им ещё не был.
        return await issue_editor_link(telegram_id, invite_code)
    finally:
        await container.shutdown_resources()


if __name__ == "__main__":
    tid = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TELEGRAM_ID
    print(asyncio.run(main(tid)))

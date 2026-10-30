"""Ссылка входа в редактор для разработки: сквозная проверка и снимки экрана без Telegram.

ОСТОРОЖНО: скрипт делает администратором условного пользователя и выдаёт рабочую ссылку
входа. Только для локальной базы. Если хост базы не `localhost` и не `127.0.0.1`,
скрипт отказывается работать, чтобы случайно не открыть доступ в рабочий редактор.

Приложение этот файл не импортирует. Запуск из каталога backend:

    uv run python -m scripts.dev_editor_link [telegram_id]

Нужны те же переменные окружения, что у приложения, и уже применённые миграции
(их применяет первый старт uvicorn). Печатает только ссылку на одной строке.
"""

import asyncio
import sys
from urllib.parse import urlparse

from src.bootstrap.di import container

# Условный администратор: в базу попадает как обычный админ, настоящего аккаунта за ним нет.
DEFAULT_TELEGRAM_ID = 1
LOCAL_HOSTS = ("localhost", "127.0.0.1")


def ensure_local_database() -> None:
    dsn = container.postgres_settings().dsn.get_secret_value()
    host = urlparse(dsn).hostname
    if host not in LOCAL_HOSTS:
        # Адрес базы в сообщение не кладём: в нём бывает пароль
        raise SystemExit("Отказ: скрипт работает только с базой на localhost или 127.0.0.1.")


async def main(telegram_id: int) -> str:
    ensure_local_database()
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

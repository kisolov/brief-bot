"""Запуск приложения на настоящих postgres и redis, без опроса Telegram."""

import asyncio
import json
import uuid
from collections.abc import AsyncIterator

import asyncpg
import pytest
from pydantic import ValidationError

from src.bootstrap.app import create_app
from src.bootstrap.di import Container
from src.shared.asyncpg_db import PostgresSettings

pytestmark = pytest.mark.integration


@pytest.fixture
async def schema_dsn() -> AsyncIterator[str]:
    """DSN со своей схемой: приложение мигрирует и засевает её, а не общую базу."""
    schema = f"t_{uuid.uuid4().hex[:12]}"
    base = PostgresSettings().dsn.get_secret_value()
    admin = await asyncpg.connect(base)
    await admin.execute(f"CREATE SCHEMA {schema}")
    try:
        yield f"{base}?search_path={schema}"
    finally:
        await admin.execute(f"DROP SCHEMA {schema} CASCADE")
        await admin.close()


async def _get(app, path: str) -> tuple[int, bytes]:
    sent = []
    done = False

    async def receive():
        nonlocal done
        if done:
            return {"type": "http.disconnect"}
        done = True
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "scheme": "http",
        "server": ("test", 80),
        "client": ("test", 1),
    }
    await app(scope, receive, send)
    status = next(m["status"] for m in sent if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    return status, body


async def test_lifespan_without_polling(monkeypatch, schema_dsn):
    monkeypatch.setenv("TELEGRAM_TOKEN", "123456:TEST-token")
    monkeypatch.setenv("TELEGRAM_MANAGER_CHAT_ID", "1")
    monkeypatch.setenv("TELEGRAM_INVITE_CODE", "invite")
    monkeypatch.setenv("TELEGRAM_POLLING_ENABLED", "false")
    monkeypatch.setenv("POSTGRES_DSN", schema_dsn)
    # Отдельная база redis, как в фикстурах интеграционных тестов.
    monkeypatch.setenv("REDIS_URL", "redis://localhost:56379/15")
    container = Container()
    app = create_app(container)

    async with app.router.lifespan_context(app):
        status, body = await _get(app, "/health")
        assert (status, json.loads(body)) == (200, {"status": "ok"})
        # Миграции и сид отработали: опубликованный сценарий читается.
        scenario = await (await container.scenario_service()).current()
        assert scenario.version == 1


async def test_missing_setting_fails_before_database(monkeypatch):
    monkeypatch.setenv("TELEGRAM_TOKEN", "123456:TEST-token")
    monkeypatch.setenv("TELEGRAM_INVITE_CODE", "invite")
    monkeypatch.delenv("TELEGRAM_MANAGER_CHAT_ID", raising=False)
    # Недоступный адрес: любое обращение к базе дало бы другую ошибку.
    monkeypatch.setenv("POSTGRES_DSN", "postgresql://x:x@127.0.0.1:1/x")
    monkeypatch.setenv("TELEGRAM_POLLING_ENABLED", "false")
    app = create_app(Container())

    with pytest.raises(ValidationError, match="manager_chat_id"):
        async with app.router.lifespan_context(app):
            pass


def _env(monkeypatch, schema_dsn: str, polling: bool) -> None:
    monkeypatch.setenv("TELEGRAM_TOKEN", "123456:TEST-token")
    monkeypatch.setenv("TELEGRAM_MANAGER_CHAT_ID", "1")
    monkeypatch.setenv("TELEGRAM_INVITE_CODE", "invite")
    monkeypatch.setenv("TELEGRAM_POLLING_ENABLED", "true" if polling else "false")
    monkeypatch.setenv("POSTGRES_DSN", schema_dsn)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:56379/15")


async def test_reminder_job_not_started_without_polling(monkeypatch, schema_dsn):
    _env(monkeypatch, schema_dsn, polling=False)
    started = []

    async def fake_job(send_reminders):
        started.append(send_reminders)

    monkeypatch.setattr("src.bootstrap.app.run_reminders", fake_job)
    app = create_app(Container())

    async with app.router.lifespan_context(app):
        await asyncio.sleep(0.05)

    assert started == []


async def test_reminder_job_runs_with_polling_and_is_cancelled(monkeypatch, schema_dsn):
    _env(monkeypatch, schema_dsn, polling=True)
    started: list[object] = []
    cancelled: list[bool] = []

    async def fake_job(send_reminders):
        started.append(send_reminders)
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.append(True)
            raise

    async def fake_poll(dispatcher, bot):
        await asyncio.Event().wait()

    monkeypatch.setattr("src.bootstrap.app.run_reminders", fake_job)
    monkeypatch.setattr("src.bootstrap.app._poll", fake_poll)
    app = create_app(Container())

    async with app.router.lifespan_context(app):
        await asyncio.sleep(0.05)
        assert len(started) == 1

    assert cancelled == [True]

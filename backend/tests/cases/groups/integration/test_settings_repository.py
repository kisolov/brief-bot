import pytest

from src.dialog.adapters.asyncpg import AsyncpgSettingsRepository
from src.dialog.entities import ReminderSettings

pytestmark = pytest.mark.integration


async def test_defaults_when_nothing_saved(db):
    repo = AsyncpgSettingsRepository(db)

    assert await repo.get_reminder() == ReminderSettings(
        hours=3, text="Вы не закончили анкету. Продолжим с того же места?"
    )


async def test_save_and_overwrite_reminder(db):
    repo = AsyncpgSettingsRepository(db)

    await repo.save_reminder(ReminderSettings(hours=5, text="Вернёмся к анкете?"))
    assert await repo.get_reminder() == ReminderSettings(hours=5, text="Вернёмся к анкете?")

    await repo.save_reminder(ReminderSettings(hours=1, text="Ещё раз"))
    assert await repo.get_reminder() == ReminderSettings(hours=1, text="Ещё раз")
    assert await db.pool.fetchval("SELECT count(*) FROM settings") == 1

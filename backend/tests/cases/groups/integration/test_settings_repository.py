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


@pytest.mark.parametrize(
    "value",
    [
        {"hours": "3", "text": "Текст"},
        {"hours": 3.5, "text": "Текст"},
        {"hours": True, "text": "Текст"},
        {"hours": 0, "text": "Текст"},
        {"hours": 3, "text": 42},
        {"hours": 3, "text": "  "},
        {"hours": 3},
        {"text": "Текст"},
        [1, 2],
        "строка",
    ],
)
async def test_corrupted_record_gives_defaults_and_warning(db, caplog, value):
    await db.pool.execute("INSERT INTO settings (key, value) VALUES ('reminder', $1)", value)
    repo = AsyncpgSettingsRepository(db)

    with caplog.at_level("WARNING"):
        result = await repo.get_reminder()

    assert result == ReminderSettings()
    warnings = [r for r in caplog.records if r.levelname == "WARNING"]
    assert len(warnings) == 1

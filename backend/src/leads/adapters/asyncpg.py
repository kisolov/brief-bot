"""Хранилище заявок в postgres: таблица leads."""

import asyncpg

from src.leads.entities import Lead, LeadAnswer, LeadStatus
from src.leads.ports import LeadRepository
from src.shared.asyncpg_db import AsyncpgDatabase
from src.shared.exceptions import NotFound

_COLUMNS = "id, chat_id, username, branch, answers, status, file_id, created_at, last_step"


class AsyncpgLeadRepository(LeadRepository):
    def __init__(self, db: AsyncpgDatabase) -> None:
        self._pool = db.pool

    async def upsert_open(self, lead: Lead) -> Lead:
        # Список, а не объект: jsonb переупорядочивает ключи, а порядок ответов важен.
        answers = [{"key": a.key, "value": a.value} for a in lead.answers]
        async with self._pool.acquire() as conn, conn.transaction():
            # Блокировка на чат: обновление открытой записи и вставка не должны разъехаться.
            await conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended('leads:' || $1::text, 0))",
                str(lead.chat_id),
            )
            row = await conn.fetchrow(
                "UPDATE leads SET username = $2, branch = $3, answers = $4, status = $5, "
                "file_id = $6, last_step = $7 "
                f"WHERE chat_id = $1 AND status = 'partial' RETURNING {_COLUMNS}",
                lead.chat_id,
                lead.username,
                lead.branch,
                answers,
                lead.status.value,
                lead.file_id,
                lead.last_step,
            )
            if row is None:
                row = await conn.fetchrow(
                    "INSERT INTO leads (chat_id, username, branch, answers, status, file_id, "
                    "created_at, last_step) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) "
                    f"RETURNING {_COLUMNS}",
                    lead.chat_id,
                    lead.username,
                    lead.branch,
                    answers,
                    lead.status.value,
                    lead.file_id,
                    lead.created_at,
                    lead.last_step,
                )
        return _to_lead(row)

    async def list(self, status: LeadStatus | None) -> list[Lead]:
        rows = await self._pool.fetch(
            f"SELECT {_COLUMNS} FROM leads WHERE $1::text IS NULL OR status = $1 "
            "ORDER BY created_at DESC, id DESC",
            status.value if status else None,
        )
        return [_to_lead(r) for r in rows]

    async def get(self, id: int) -> Lead:
        row = await self._pool.fetchrow(f"SELECT {_COLUMNS} FROM leads WHERE id = $1", id)
        if row is None:
            raise NotFound(f"заявки {id} нет")
        return _to_lead(row)


def _to_lead(row: asyncpg.Record) -> Lead:
    raw = row["answers"]
    # Колонка по умолчанию '{}': пустой объект читается как "ответов нет".
    items = raw if isinstance(raw, list) else []
    return Lead(
        id=row["id"],
        chat_id=row["chat_id"],
        username=row["username"],
        branch=row["branch"],
        answers=tuple(LeadAnswer(i["key"], i["value"]) for i in items),
        status=LeadStatus(row["status"]),
        file_id=row["file_id"],
        created_at=row["created_at"],
        last_step=row["last_step"],
    )

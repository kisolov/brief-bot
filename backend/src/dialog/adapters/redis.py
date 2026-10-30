"""Сессии и очередь напоминаний в redis. Сессия хранится JSON-ом по ключу session:<chat_id>."""

import json
from datetime import datetime
from typing import Any

from redis.asyncio import Redis

from src.dialog.entities import Answer, Session
from src.dialog.ports import ReminderQueue, SessionRepository

SESSION_TTL_SECONDS = 30 * 24 * 3600
REMINDERS_KEY = "reminders"


def session_to_json(session: Session) -> str:
    """Кортежи станут списками, Answer словарём; обратно их собирает session_from_json."""
    return json.dumps(_session_to_dict(session), ensure_ascii=False)


def session_from_json(raw: str) -> Session:
    """Собирает Session из JSON.

    Старый JSON без снимков истории дополняется: стек возврата пустым, ответы текущими ключами.
    """
    data = json.loads(raw)
    history = tuple(data.get("history", ()))
    answers = {k: _answer_from_dict(v) for k, v in data.get("answers", {}).items()}
    return Session(
        chat_id=data["chat_id"],
        version=data["version"],
        step=data["step"],
        history=history,
        returns=tuple(data.get("returns", ())),
        answers=answers,
        pending_input=data.get("pending_input"),
        finished=data.get("finished", False),
        reminded=data.get("reminded", False),
        # Снимки должны быть параллельны history, иначе "Назад" упадёт на IndexError.
        history_returns=_snapshots(data.get("history_returns"), len(history)),
        # Недостающие снимки ответов берут текущие ключи: "Назад" не должен стирать заявку.
        history_answers=_snapshots(data.get("history_answers"), len(history), tuple(answers)),
        username=data.get("username"),
    )


def _session_to_dict(session: Session) -> dict[str, Any]:
    return {
        "chat_id": session.chat_id,
        "version": session.version,
        "step": session.step,
        "history": list(session.history),
        "returns": list(session.returns),
        "answers": {k: _answer_to_dict(a) for k, a in session.answers.items()},
        "pending_input": session.pending_input,
        "finished": session.finished,
        "reminded": session.reminded,
        "history_returns": [list(s) for s in session.history_returns],
        "history_answers": [list(s) for s in session.history_answers],
        "username": session.username,
    }


def _answer_to_dict(answer: Answer) -> dict[str, Any]:
    return {
        "step": answer.step,
        "key": answer.key,
        "labels": list(answer.labels),
        "ids": list(answer.ids),
        "texts": dict(answer.texts),
        "file_id": answer.file_id,
    }


def _answer_from_dict(data: dict[str, Any]) -> Answer:
    return Answer(
        step=data["step"],
        key=data.get("key"),
        labels=tuple(data.get("labels", ())),
        ids=tuple(data.get("ids", ())),
        texts=dict(data.get("texts", {})),
        file_id=data.get("file_id"),
    )


def _snapshots(
    raw: list[list[str]] | None, length: int, filler: tuple[str, ...] = ()
) -> tuple[tuple[str, ...], ...]:
    snaps = tuple(tuple(s) for s in raw or ())
    return snaps + (filler,) * (length - len(snaps))


class RedisSessionRepository(SessionRepository):
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def get(self, chat_id: int) -> Session | None:
        raw = await self._redis.get(_key(chat_id))
        return None if raw is None else session_from_json(raw)

    async def save(self, session: Session) -> None:
        await self._redis.set(
            _key(session.chat_id), session_to_json(session), ex=SESSION_TTL_SECONDS
        )

    async def delete(self, chat_id: int) -> None:
        await self._redis.delete(_key(chat_id))


class RedisReminderQueue(ReminderQueue):
    """ZSET reminders: член chat_id, оценка это время срабатывания в секундах unix.

    `due` забирает записи: выдаёт только то, что сам убрал из ZSET.
    """

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def schedule(self, chat_id: int, at: datetime) -> None:
        await self._redis.zadd(REMINDERS_KEY, {str(chat_id): at.timestamp()})

    async def cancel(self, chat_id: int) -> None:
        await self._redis.zrem(REMINDERS_KEY, str(chat_id))

    async def due(self, now: datetime, limit: int) -> list[int]:
        members = await self._redis.zrangebyscore(
            REMINDERS_KEY, "-inf", now.timestamp(), start=0, num=limit
        )
        taken = []
        for member in members:
            # ZREM вернёт 1 только одному из параллельных вызовов: запись достанется ему.
            if await self._redis.zrem(REMINDERS_KEY, member):
                taken.append(int(member))
        return taken


def _key(chat_id: int) -> str:
    return f"session:{chat_id}"

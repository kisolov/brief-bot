"""Сущности заявок. Домен не знает про диалог и сценарий."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class LeadStatus(StrEnum):
    PARTIAL = "partial"
    FULL = "full"


@dataclass(frozen=True)
class LeadAnswer:
    key: str
    value: str


@dataclass(frozen=True)
class Lead:
    # None до первого сохранения.
    id: int | None
    chat_id: int
    username: str | None
    branch: str
    # Порядок ответов сохраняется: это порядок прохождения анкеты.
    answers: tuple[LeadAnswer, ...]
    status: LeadStatus
    file_id: str | None
    created_at: datetime
    last_step: str | None

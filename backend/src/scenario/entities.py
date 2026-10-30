"""Модель сценария: шаги, опции, переходы и условия."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Literal

RETURN = "@return"


class StepType(StrEnum):
    CHOICE = "choice"
    MULTI = "multi"
    MULTI_INPUT = "multi_input"
    TEXT = "text"
    FILE = "file"
    INFO = "info"


@dataclass(frozen=True)
class When:
    """Условие показа: ответ на шаг `step` входит в `any` и не входит в `none`."""

    step: str
    any: tuple[str, ...]
    # Условие ложно, если отмечен хотя бы один id из none.
    none: tuple[str, ...] = ()


@dataclass(frozen=True)
class Call:
    """Вход в блок `block`; после возврата сценарий идёт на `then`."""

    block: str
    then: str | None = None


Target = str | Call


@dataclass(frozen=True)
class Option:
    id: str
    label: str
    next: Target | None = None
    input: str | None = None
    exclusive: bool = False
    when: When | None = None
    url: str | None = None


@dataclass(frozen=True)
class Step:
    id: str
    type: StepType
    text: str
    key: str | None = None
    options: tuple[Option, ...] = ()
    next: Target | None = None
    when: When | None = None
    no_back: bool = False
    validate: Literal["phone", "url"] | None = None
    done_label: str | None = None
    # Конечный шаг с кнопками: вход в него завершает анкету, кнопка начинает новую.
    finish: bool = False
    # Куда ведёт "Назад" на первом шаге нового прохода после finish-шага.
    back_to: str | None = None
    # Координаты ноды в редакторе, движок их не читает.
    pos: tuple[float, float] | None = None


@dataclass(frozen=True)
class Scenario:
    version: int
    entry: str
    blocks: dict[str, str]
    steps: dict[str, Step]


@dataclass(frozen=True)
class Draft:
    """Черновик редактора: сырой JSON, может быть невалидным; revision растёт при сохранении."""

    data: dict
    revision: int


@dataclass(frozen=True)
class VersionInfo:
    number: int
    published_at: datetime
    active: bool

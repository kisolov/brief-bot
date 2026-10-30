"""Сущности диалога: событие, сессия, ответ, экран. Всё сериализуется в JSON."""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal


@dataclass(frozen=True)
class Event:
    kind: Literal["start", "button", "done", "back", "text", "file"]
    step: str = ""
    # id опции для кнопки, текст для text, file_id для file.
    value: str = ""


@dataclass(frozen=True)
class Answer:
    step: str
    key: str | None
    labels: tuple[str, ...] = ()
    ids: tuple[str, ...] = ()
    # Текст шага лежит в texts["value"], текст опции multi_input в texts[option_id].
    texts: dict[str, str] = field(default_factory=dict)
    file_id: str | None = None


@dataclass(frozen=True)
class Session:
    chat_id: int
    version: int
    step: str
    # Пройденные шаги до текущего, последний элемент это предыдущий шаг.
    history: tuple[str, ...] = ()
    # Стек возврата из блоков: id шагов, на которые вернёмся по @return.
    returns: tuple[str, ...] = ()
    answers: dict[str, Answer] = field(default_factory=dict)
    pending_input: str | None = None
    finished: bool = False
    reminded: bool = False
    # Снимки returns, параллельные history: history_returns[i] это стек возврата в момент,
    # когда шаг history[i] был текущим. "Назад" восстанавливает его вместе с шагом.
    history_returns: tuple[tuple[str, ...], ...] = ()
    # Снимки ключей answers, параллельные history: ключи на момент ухода с шага history[i],
    # включая его собственный ответ. "Назад" оставляет в answers только их.
    history_answers: tuple[tuple[str, ...], ...] = ()
    username: str | None = None


@dataclass(frozen=True)
class Button:
    id: str
    label: str
    checked: bool = False
    url: str | None = None


@dataclass(frozen=True)
class Screen:
    step: str
    text: str
    buttons: tuple[Button, ...] = ()
    can_done: bool = False
    can_back: bool = False
    expects: Literal["none", "text", "file"] = "none"
    edit: bool = False
    done_label: str = "Готово"


class Effect(StrEnum):
    FINISHED = "finished"
    PROGRESS = "progress"


@dataclass(frozen=True)
class StepResult:
    session: Session
    screen: Screen
    effects: tuple[Effect, ...] = ()


def answer_text(answer: Answer) -> str:
    """Ответ одной строкой для заявки: подписи через запятую, текст опции в скобках."""
    if answer.file_id is not None:
        return "файл"
    if not answer.ids:
        return answer.texts.get("value", "")
    parts = []
    for option_id, label in zip(answer.ids, answer.labels, strict=False):
        extra = answer.texts.get(option_id)
        parts.append(f"{label} ({extra})" if extra else label)
    return ", ".join(parts)

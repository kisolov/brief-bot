"""callback_data кнопок. Формат: s:<шаг>:o:<опция>, s:<шаг>:d, s:<шаг>:b, r:continue, r:restart.

Id шагов и опций это [a-z0-9_] до 24 символов, поэтому самая длинная строка 53 байта (лимит 64).
Подпись кнопки в данных не участвует: префикс отметки её не удлиняет.
"""

import re
from typing import Literal

from src.dialog.entities import Event

_STEP_RE = re.compile(r"^s:([a-z0-9_]{1,24}):(?:o:([a-z0-9_]{1,24})|(d)|(b))$")
_RESUME_RE = re.compile(r"^r:(continue|restart)$")


def pack_button(step: str, option: str) -> str:
    return f"s:{step}:o:{option}"


def pack_done(step: str) -> str:
    return f"s:{step}:d"


def pack_back(step: str) -> str:
    return f"s:{step}:b"


def pack_resume(choice: str) -> str:
    return f"r:{choice}"


def unpack(data: str) -> Event | None:
    """Событие из данных кнопки шага. Чужие данные и кнопки возобновления дают None."""
    match = _STEP_RE.match(data)
    if match is None:
        return None
    step, option, done, _back = match.groups()
    if option is not None:
        return Event("button", step=step, value=option)
    if done is not None:
        return Event("done", step=step)
    return Event("back", step=step)


def unpack_resume(data: str) -> Literal["continue", "restart"] | None:
    match = _RESUME_RE.match(data)
    if match is None:
        return None
    return "continue" if match.group(1) == "continue" else "restart"

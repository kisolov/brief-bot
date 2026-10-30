"""Прогон сценария по списку подписей кнопок и ответов, как это делает человек в чате."""

import unicodedata

from src.dialog.engine import new_session, render, step
from src.dialog.entities import Event, Screen, Session, StepResult
from src.scenario.entities import Scenario

FILE_PREFIX = "file:"


def _bare(label: str) -> str:
    """Подпись без ведущих эмодзи, чтобы в сценариях тестов писать "Товары", а не "🛍 Товары"."""
    i = 0
    while i < len(label) and (
        unicodedata.category(label[i]) in ("So", "Sk", "Cf", "Mn", "Zs") or label[i] in "️‍"
    ):
        i += 1
    return label[i:]


def _button(screen: Screen, item: str) -> str | None:
    for b in screen.buttons:
        if b.url is None and item in (b.label, _bare(b.label)):
            return b.id
    return None


def _event(screen: Screen, item: str) -> Event:
    option_id = _button(screen, item)
    if option_id is not None:
        return Event("button", step=screen.step, value=option_id)
    if screen.expects == "file" and item.startswith(FILE_PREFIX):
        return Event("file", step=screen.step, value=item[len(FILE_PREFIX) :])
    if item == "Назад" and screen.can_back:
        return Event("back", step=screen.step)
    if screen.can_done and item == screen.done_label:
        return Event("done", step=screen.step)
    if screen.expects == "text":
        return Event("text", step=screen.step, value=item)
    labels = [b.label for b in screen.buttons]
    raise AssertionError(f"На шаге {screen.step} нет кнопки {item!r}. Есть: {labels}")


def play(scenario: Scenario, script: list[str]) -> StepResult:
    """Применяет подписи кнопок и ответы по порядку. Неизвестная подпись это ошибка теста."""
    session = new_session(scenario, chat_id=1)
    result = StepResult(session, render(scenario, session), ())
    for item in script:
        before = result.session
        result = step(scenario, before, _event(result.screen, item))
        if result.session == before:
            raise AssertionError(
                f"Событие {item!r} на шаге {before.step} не изменило сессию: "
                f"ввод отклонён или кнопка не работает"
            )
    return result


def walk(scenario: Scenario, script: list[str]) -> Session:
    return play(scenario, script).session

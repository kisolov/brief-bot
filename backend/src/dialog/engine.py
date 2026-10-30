"""Движок диалога: чистые функции, без ввода-вывода. Состояние живёт только в Session."""

import re
from dataclasses import replace

from src.dialog.entities import (
    Answer,
    Button,
    Effect,
    Event,
    Screen,
    Session,
    StepResult,
)
from src.scenario.entities import RETURN, Call, Option, Scenario, Step, StepType, Target, When

_MULTI_TYPES = (StepType.MULTI, StepType.MULTI_INPUT)
_TEMPLATE_RE = re.compile(r"\{([^{}]+)\}")
_PHONE_RE = re.compile(r"[\d\s()+\-]+")
_RESOLVE_LIMIT = 1000

_PHONE_ERROR = "Не похоже на номер телефона. Напишите номер в формате +7 999 999-99-99."
_URL_ERROR = "Не похоже на ссылку. Напишите адрес сайта, например example.ru."


def new_session(scenario: Scenario, chat_id: int) -> Session:
    first = scenario.steps[scenario.entry]
    return Session(
        chat_id=chat_id,
        version=scenario.version,
        step=scenario.entry,
        finished=_is_terminal(first),
    )


def step(scenario: Scenario, session: Session, event: Event) -> StepResult:
    """Применяет событие к сессии и возвращает новую сессию, экран и эффекты."""
    if session.finished:
        current = scenario.steps[session.step]
        if current.finish and event.kind == "button" and event.step == session.step:
            return _restart(scenario, session, current, event.value)
        return _same(scenario, session)
    if event.kind == "start":
        return _same(scenario, session)
    if event.kind in ("button", "done", "back") and event.step != session.step:
        return _same(scenario, session)

    current = scenario.steps[session.step]
    if session.pending_input is not None:
        return _on_pending(scenario, session, current, event)
    if event.kind == "button":
        return _on_button(scenario, session, current, event.value)
    if event.kind == "done":
        return _on_done(scenario, session, current)
    if event.kind == "back":
        return _on_back(scenario, session, current)
    if event.kind == "text":
        return _on_text(scenario, session, current, event.value)
    if event.kind == "file":
        return _on_file(scenario, session, current, event.value)
    return _same(scenario, session)


def render(scenario: Scenario, session: Session) -> Screen:
    """Экран текущего шага. Кнопку "Назад" добавляет движок."""
    current = scenario.steps[session.step]
    if session.pending_input is not None:
        option = _option(current, session.pending_input)
        prompt = option.input if option and option.input else current.text
        return Screen(
            step=current.id,
            text=_fill(prompt, session.answers),
            can_back=True,
            expects="text",
        )

    text = _fill(current.text, session.answers)
    if session.finished:
        buttons = ()
        if current.finish:
            buttons = tuple(
                Button(id=o.id, label=o.label, url=o.url)
                for o in _visible_options(current, session.answers)
            )
        return Screen(step=current.id, text=text, buttons=buttons, done_label=_done_label(current))

    checked = session.answers[current.id].ids if current.id in session.answers else ()
    buttons = tuple(
        Button(id=o.id, label=o.label, checked=o.id in checked, url=o.url)
        for o in _visible_options(current, session.answers)
    )
    can_done = current.type in _MULTI_TYPES or (
        current.type == StepType.INFO and not current.options and current.next is not None
    )
    expects = (
        "text"
        if current.type == StepType.TEXT
        else "file"
        if current.type == StepType.FILE
        else "none"
    )
    return Screen(
        step=current.id,
        text=text,
        buttons=buttons,
        can_done=can_done,
        can_back=bool(session.history) and not current.no_back,
        expects=expects,
        done_label=_done_label(current),
    )


# --- обработчики событий ---


def _on_button(scenario: Scenario, session: Session, current: Step, option_id: str) -> StepResult:
    option = next(
        (o for o in _visible_options(current, session.answers) if o.id == option_id), None
    )
    if option is None or option.url is not None:
        return _same(scenario, session)

    if current.type in _MULTI_TYPES:
        return _toggle(scenario, session, current, option)
    if option.next is None:
        return _same(scenario, session)

    answers = session.answers
    if current.type == StepType.CHOICE:
        answers = {
            **answers,
            current.id: Answer(current.id, current.key, (option.label,), (option.id,)),
        }
    elif current.type != StepType.INFO:
        return _same(scenario, session)
    return _advance(scenario, session, answers, option.next)


def _restart(scenario: Scenario, session: Session, current: Step, option_id: str) -> StepResult:
    """Кнопка под финалом начинает новый проход: ответы и история чистые, версия прежняя."""
    option = next(
        (o for o in _visible_options(current, session.answers) if o.id == option_id), None
    )
    if option is None or option.url is not None or option.next is None:
        return _same(scenario, session)
    fresh = replace(
        session,
        history=(),
        history_returns=(),
        history_answers=(),
        returns=(),
        answers={},
        pending_input=None,
        finished=False,
        reminded=False,
    )
    dest, returns = _resolve(scenario, {}, (), option.next)
    if dest is None:
        return _same(scenario, session)
    terminal = _is_terminal(scenario.steps[dest])
    moved = replace(fresh, step=dest, returns=returns, finished=terminal)
    effect = Effect.FINISHED if terminal else Effect.PROGRESS
    return StepResult(moved, render(scenario, moved), (effect,))


def _on_done(scenario: Scenario, session: Session, current: Step) -> StepResult:
    can = current.type in _MULTI_TYPES or (current.type == StepType.INFO and not current.options)
    if not can or current.next is None:
        return _same(scenario, session)
    return _advance(scenario, session, session.answers, current.next)


def _on_text(scenario: Scenario, session: Session, current: Step, raw: str) -> StepResult:
    if current.type != StepType.TEXT or current.next is None:
        return _same(scenario, session)
    value = raw.strip()
    if not value:
        return _same(scenario, session)
    error = _validation_error(current, value)
    if error:
        screen = render(scenario, session)
        return StepResult(session, replace(screen, text=f"{error}\n\n{screen.text}"), ())
    answers = {
        **session.answers,
        current.id: Answer(current.id, current.key, texts={"value": value}),
    }
    return _advance(scenario, session, answers, current.next)


def _on_file(scenario: Scenario, session: Session, current: Step, file_id: str) -> StepResult:
    if current.type != StepType.FILE or current.next is None or not file_id:
        return _same(scenario, session)
    answers = {**session.answers, current.id: Answer(current.id, current.key, file_id=file_id)}
    return _advance(scenario, session, answers, current.next)


def _on_back(scenario: Scenario, session: Session, current: Step) -> StepResult:
    if not session.history or current.no_back:
        return _same(scenario, session)
    # Остаются только ответы, что были на момент ухода с этого шага.
    kept = set(session.history_answers[-1])
    answers = {k: v for k, v in session.answers.items() if k in kept}
    moved = replace(
        session,
        step=session.history[-1],
        history=session.history[:-1],
        returns=session.history_returns[-1],
        history_returns=session.history_returns[:-1],
        history_answers=session.history_answers[:-1],
        answers=answers,
    )
    return StepResult(moved, render(scenario, moved), (Effect.PROGRESS,))


def _on_pending(scenario: Scenario, session: Session, current: Step, event: Event) -> StepResult:
    option_id = session.pending_input
    if event.kind == "back" and option_id is not None:
        answers = _without_option(session.answers, current, option_id)
        moved = replace(session, answers=answers, pending_input=None)
        return StepResult(moved, render(scenario, moved), (Effect.PROGRESS,))
    if event.kind == "text" and option_id is not None:
        value = event.value.strip()
        if not value:
            return _same(scenario, session)
        old = session.answers[current.id]
        saved = replace(old, texts={**old.texts, option_id: value})
        moved = replace(session, answers={**session.answers, current.id: saved}, pending_input=None)
        return StepResult(moved, render(scenario, moved), (Effect.PROGRESS,))
    return _same(scenario, session)


def _toggle(scenario: Scenario, session: Session, current: Step, option: Option) -> StepResult:
    old = session.answers.get(current.id)
    ids = list(old.ids) if old else []
    texts = dict(old.texts) if old else {}

    if option.id in ids:
        ids.remove(option.id)
        texts.pop(option.id, None)
    else:
        by_id = {o.id: o for o in current.options}
        if option.exclusive:
            ids = []
        else:
            ids = [i for i in ids if not by_id[i].exclusive]
        ids.append(option.id)
        texts = {k: v for k, v in texts.items() if k in ids}

    order = {o.id: n for n, o in enumerate(current.options)}
    ids.sort(key=order.__getitem__)
    labels = tuple(current.options[order[i]].label for i in ids)

    answers = {k: v for k, v in session.answers.items() if k != current.id}
    if ids:
        answers[current.id] = Answer(current.id, current.key, labels, tuple(ids), texts)

    asks_text = (
        current.type == StepType.MULTI_INPUT and option.input is not None and option.id in ids
    )
    moved = replace(session, answers=answers, pending_input=option.id if asks_text else None)
    screen = render(scenario, moved)
    # Редактируем сообщение только при обычной отметке: запрос текста приходит новым.
    if not asks_text:
        screen = replace(screen, edit=True)
    return StepResult(moved, screen, (Effect.PROGRESS,))


def _without_option(answers: dict[str, Answer], current: Step, option_id: str) -> dict[str, Answer]:
    old = answers.get(current.id)
    rest = {k: v for k, v in answers.items() if k != current.id}
    if old is None:
        return rest
    pairs = [(i, label) for i, label in zip(old.ids, old.labels, strict=False) if i != option_id]
    if pairs:
        texts = {k: v for k, v in old.texts.items() if k != option_id}
        rest[current.id] = Answer(
            current.id, current.key, tuple(p[1] for p in pairs), tuple(p[0] for p in pairs), texts
        )
    return rest


# --- переходы ---


def _advance(
    scenario: Scenario, session: Session, answers: dict[str, Answer], target: Target
) -> StepResult:
    dest, returns = _resolve(scenario, answers, session.returns, target)
    if dest is None:
        # Анкета закончилась на текущем шаге: @return при пустом стеке.
        done = replace(session, answers=answers, returns=returns, finished=True)
        return StepResult(done, render(scenario, done), (Effect.FINISHED,))

    path = session.history + (session.step,)
    snaps = session.history_returns + (session.returns,)
    kept = session.history_answers + (tuple(answers),)
    if dest in path:
        cut = path.index(dest)
        path, snaps, kept = path[:cut], snaps[:cut], kept[:cut]

    terminal = _is_terminal(scenario.steps[dest])
    moved = replace(
        session,
        step=dest,
        history=path,
        history_returns=snaps,
        history_answers=kept,
        returns=returns,
        answers=answers,
        pending_input=None,
        finished=terminal,
    )
    effect = Effect.FINISHED if terminal else Effect.PROGRESS
    return StepResult(moved, render(scenario, moved), (effect,))


def _resolve(
    scenario: Scenario, answers: dict[str, Answer], returns: tuple[str, ...], target: Target | None
) -> tuple[str | None, tuple[str, ...]]:
    """Идёт по Call, @return и пропускам по when до показываемого шага."""
    stack = list(returns)
    for _ in range(_RESOLVE_LIMIT):
        if target is None:
            break
        if isinstance(target, Call):
            if target.then is not None:
                stack.append(target.then)
            target = scenario.blocks[target.block]
        elif target == RETURN:
            if not stack:
                break
            target = stack.pop()
        else:
            candidate = scenario.steps[target]
            if candidate.when is not None and not _met(candidate.when, answers):
                target = candidate.next
                continue
            return target, tuple(stack)
    return None, tuple(stack)


# --- вспомогательное ---


def _same(scenario: Scenario, session: Session) -> StepResult:
    return StepResult(session, render(scenario, session), ())


def _is_terminal(current: Step) -> bool:
    if current.finish:
        return True
    return current.type == StepType.INFO and not current.options and current.next is None


def _done_label(current: Step) -> str:
    if current.done_label:
        return current.done_label
    return "Продолжить" if current.type == StepType.INFO else "Готово"


def _met(when: When, answers: dict[str, Answer]) -> bool:
    answer = answers.get(when.step)
    if answer is None:
        return False
    return any(i in answer.ids for i in when.any) and not any(i in answer.ids for i in when.none)


def _visible_options(current: Step, answers: dict[str, Answer]) -> list[Option]:
    return [o for o in current.options if o.when is None or _met(o.when, answers)]


def _option(current: Step, option_id: str) -> Option | None:
    return next((o for o in current.options if o.id == option_id), None)


def _fill(text: str, answers: dict[str, Answer]) -> str:
    """Подставляет {ключ} из текстовых ответов; неизвестный ключ остаётся как есть."""
    values = {
        a.key: a.texts["value"]
        for a in answers.values()
        if a.key is not None and "value" in a.texts
    }
    return _TEMPLATE_RE.sub(lambda m: values.get(m.group(1), m.group(0)), text)


def _validation_error(current: Step, value: str) -> str | None:
    if current.validate == "phone":
        digits = sum(c.isdigit() for c in value)
        if digits < 10 or not _PHONE_RE.fullmatch(value):
            return _PHONE_ERROR
    elif current.validate == "url":
        looks_like_url = value.startswith(("http://", "https://")) or (
            "." in value and not any(c.isspace() for c in value)
        )
        if not looks_like_url:
            return _URL_ERROR
    return None

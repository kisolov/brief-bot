"""Проверка сценария: ошибки, которые редактор показывает заказчику."""

import re
from dataclasses import dataclass

from src.scenario.entities import RETURN, Call, Option, Scenario, Step, StepType, Target

_ID_RE = re.compile(r"[a-z0-9_]{1,24}")
_CALLBACK_LIMIT = 64
_LABEL_LIMIT = 40
# Telegram считает длину сообщения в единицах UTF-16.
_TEXT_LIMIT = 4096

# Типы, где переход задаёт опция. У остальных переход только по next шага.
_OPTION_NEXT_TYPES = (StepType.CHOICE, StepType.INFO)
_OPTIONS_REQUIRED = (StepType.CHOICE, StepType.MULTI, StepType.MULTI_INPUT)
# Ответ этих типов читает менеджер. Выбор в choice может быть просто навигацией.
_ANSWER_TYPES = (StepType.TEXT, StepType.FILE, StepType.MULTI, StepType.MULTI_INPUT)
_NO_FINISH_TYPES = (StepType.TEXT, StepType.FILE)


@dataclass(frozen=True)
class Issue:
    code: str
    step_id: str
    option_id: str | None
    message: str


def validate_scenario(s: Scenario) -> list[Issue]:
    issues: list[Issue] = []
    reachable = _reachable(s)

    if s.entry not in s.steps:
        issues.append(
            Issue(
                "missing_target",
                s.entry,
                None,
                "Не выбран первый шаг сценария. Укажите, с какого шага начинается диалог.",
            )
        )

    for sid, step in s.steps.items():
        if not _ID_RE.fullmatch(sid):
            issues.append(_bad_id(sid, None, "шага"))
        if sid not in reachable:
            issues.append(Issue("unreachable", sid, None, "К этому шагу не ведёт ни одна кнопка."))
        if step.when and step.when.step not in s.steps:
            issues.append(_when_unknown(sid, None))
        if step.type in _OPTIONS_REQUIRED and not step.options:
            issues.append(
                Issue(
                    "no_options",
                    sid,
                    None,
                    "У этого шага нет ни одной кнопки. Добавьте варианты ответа.",
                )
            )
        issues.extend(_check_target(s, sid, None, step.next))
        if step.back_to is not None and step.back_to not in s.steps:
            issues.append(_missing_target(sid, None))
        if step.next is None and _needs_next(step):
            issues.append(
                Issue(
                    "missing_next",
                    sid,
                    None,
                    "После ответа бот не знает, куда идти. Выберите следующий шаг.",
                )
            )
        issues.extend(_check_content(step))
        for opt in step.options:
            issues.extend(_check_option(s, step, opt))

    for name, target_step in s.blocks.items():
        if target_step not in s.steps:
            issues.append(
                Issue(
                    "missing_target",
                    name,
                    None,
                    f'Повторяющийся блок "{name}" ведёт на шаг, которого нет. '
                    "Выберите существующий шаг.",
                )
            )
    issues.extend(_check_returns(s, reachable))
    return issues


def _needs_next(step: Step) -> bool:
    # Шаг с условием пропускается по next, поэтому next нужен любому такому шагу.
    if step.when is not None or step.type in _ANSWER_TYPES:
        return True
    if step.type != StepType.INFO or step.finish:
        return False
    # Кнопка-ссылка не уводит с шага: без перехода человек на нём застрянет.
    return all(o.next is None for o in step.options)


def _check_content(step: Step) -> list[Issue]:
    issues = _check_text(step.id, None, step.text)
    if step.finish and step.type in _NO_FINISH_TYPES:
        issues.append(
            Issue(
                "bad_finish",
                step.id,
                None,
                "Завершать анкету может только шаг с сообщением или кнопками.",
            )
        )
    if step.type in _ANSWER_TYPES and not (step.key or "").strip():
        issues.append(Issue("missing_key", step.id, None, "Укажите, как подписать ответ в заявке."))
    return issues


def _check_text(sid: str, oid: str | None, text: str) -> list[Issue]:
    if not text.strip():
        return [Issue("empty_text", sid, oid, "У шага нет текста.")]
    if len(text.encode("utf-16-le")) // 2 > _TEXT_LIMIT:
        return [
            Issue(
                "text_too_long",
                sid,
                oid,
                f"Текст длиннее {_TEXT_LIMIT} знаков, Telegram его не отправит.",
            )
        ]
    return []


def _check_option(s: Scenario, step: Step, opt: Option) -> list[Issue]:
    sid = step.id
    issues: list[Issue] = []
    if not _ID_RE.fullmatch(opt.id):
        issues.append(_bad_id(sid, opt.id, "кнопки"))
    if opt.when and opt.when.step not in s.steps:
        issues.append(_when_unknown(sid, opt.id))
    if not opt.label.strip():
        issues.append(Issue("empty_label", sid, opt.id, "У кнопки нет подписи."))
    if opt.url and not _is_http_url(opt.url):
        issues.append(
            Issue(
                "bad_url",
                sid,
                opt.id,
                "Адрес ссылки должен начинаться с http:// или https://.",
            )
        )
    if opt.input is not None and step.type == StepType.MULTI:
        issues.append(
            Issue(
                "input_on_multi",
                sid,
                opt.id,
                'Свой текст доступен только у типа "Несколько + поле".',
            )
        )
    if opt.input is not None and step.type == StepType.MULTI_INPUT:
        issues.extend(_check_text(sid, opt.id, opt.input))
    if len(opt.label) > _LABEL_LIMIT:
        issues.append(
            Issue(
                "label_too_long",
                sid,
                opt.id,
                f'Надпись на кнопке "{opt.label}" слишком длинная. '
                f"Сократите до {_LABEL_LIMIT} знаков.",
            )
        )
    if len(f"s:{sid}:o:{opt.id}".encode()) > _CALLBACK_LIMIT:
        issues.append(
            Issue(
                "callback_too_long",
                sid,
                opt.id,
                f'Кнопка "{opt.label}" не сработает в Телеграме. '
                "Сделайте названия шага и кнопки короче.",
            )
        )
    issues.extend(_check_target(s, sid, opt.id, opt.next))
    # Пустой адрес ссылки не считается переходом
    if opt.next is None and not opt.url and (step.type in _OPTION_NEXT_TYPES or step.finish):
        issues.append(
            Issue(
                "missing_next",
                sid,
                opt.id,
                f'Кнопка "{opt.label}" никуда не ведёт. Выберите следующий шаг.',
            )
        )
    return issues


def _is_http_url(url: str) -> bool:
    return url.startswith(("http://", "https://")) and not any(c.isspace() for c in url)


def _check_target(s: Scenario, sid: str, oid: str | None, target: Target | None) -> list[Issue]:
    if target is None:
        return []
    issues: list[Issue] = []
    if isinstance(target, Call):
        if target.block not in s.blocks:
            issues.append(
                Issue(
                    "unknown_block",
                    sid,
                    oid,
                    f'Повторяющегося блока "{target.block}" нет. Выберите существующий блок.',
                )
            )
        if target.then is not None and not _exists(s, target.then):
            issues.append(_missing_target(sid, oid))
    elif not _exists(s, target):
        issues.append(_missing_target(sid, oid))
    return issues


def _exists(s: Scenario, step_id: str) -> bool:
    return step_id == RETURN or step_id in s.steps


def _missing_target(sid: str, oid: str | None) -> Issue:
    where = "Кнопка" if oid else "Шаг"
    return Issue(
        "missing_target",
        sid,
        oid,
        f"{where} ведёт на шаг, которого нет. Выберите существующий шаг.",
    )


def _bad_id(sid: str, oid: str | None, what: str) -> Issue:
    return Issue(
        "bad_id",
        sid,
        oid,
        f"Название {what} можно писать только маленькими латинскими буквами, цифрами и знаком _. "
        "Не больше 24 знаков.",
    )


def _when_unknown(sid: str, oid: str | None) -> Issue:
    return Issue(
        "when_unknown_step",
        sid,
        oid,
        "Условие показа ссылается на шаг, которого нет. Выберите существующий шаг.",
    )


def _reachable(s: Scenario) -> set[str]:
    """Шаги, до которых можно дойти от входа; блоки достижимы только через Call."""
    seen: set[str] = set()
    stack = [s.entry]
    while stack:
        sid = stack.pop()
        step = s.steps.get(sid)
        if sid in seen or step is None:
            continue
        seen.add(sid)
        for _, target in _edges(step):
            stack.extend(_targets_of(s, target))
    return seen


def _edges(step: Step) -> list[tuple[str | None, Target]]:
    """Переходы шага: id опции (None у next самого шага) и цель."""
    found: list[tuple[str | None, Target | None]] = [(None, step.next)]
    if step.type in _OPTION_NEXT_TYPES or step.finish:
        found.extend((o.id, o.next) for o in step.options)
    return [(oid, target) for oid, target in found if target is not None]


def _check_returns(s: Scenario, reachable: set[str]) -> list[Issue]:
    """Ищет @return там, где стек возврата может быть пуст: бот бы застрял на шаге.

    Стек пуст от входа в сценарий и после кнопки под финалом: она начинает новый проход.
    Внутрь блока обход не идёт: там возврат есть, если блок вызван с then.
    """
    issues: list[Issue] = []
    stack: list[str] = [s.entry]

    def visit(sid: str, oid: str | None, target: Target) -> None:
        if target == RETURN:
            issues.append(_dead_end(sid, oid))
        elif not isinstance(target, Call):
            stack.append(target)
        elif target.then is not None and target.then != RETURN:
            stack.append(target.then)
        elif target.block in s.blocks and _can_return(s, s.blocks[target.block]):
            issues.append(_no_return_step(sid, oid))

    for sid, step in s.steps.items():
        if sid not in reachable or not step.finish:
            continue
        if step.back_to is not None:
            stack.append(step.back_to)
        for opt in step.options:
            if opt.next is not None:
                visit(sid, opt.id, opt.next)

    seen: set[str] = set()
    while stack:
        sid = stack.pop()
        step = s.steps.get(sid)
        if sid in seen or step is None:
            continue
        seen.add(sid)
        for oid, target in _edges(step):
            visit(sid, oid, target)
    # Финал мог попасть в обход дважды: проблема показывается один раз.
    return list(dict.fromkeys(issues))


def _can_return(s: Scenario, entry: str) -> bool:
    """Дойдёт ли блок от шага entry до @return на своём уровне стека."""
    seen: set[str] = set()
    stack = [entry]
    while stack:
        sid = stack.pop()
        step = s.steps.get(sid)
        # Кнопка финала начинает новый проход, это уже не выход из блока.
        if sid in seen or step is None or step.finish:
            continue
        seen.add(sid)
        for _, target in _edges(step):
            if target == RETURN:
                return True
            if not isinstance(target, Call):
                stack.append(target)
            elif target.then == RETURN:
                return True
            elif target.then is not None:
                stack.append(target.then)
            elif target.block in s.blocks:
                stack.append(s.blocks[target.block])
    return False


def _no_return_step(sid: str, oid: str | None) -> Issue:
    return Issue(
        "missing_next",
        sid,
        oid,
        "После блока бот не знает, куда идти. Выберите шаг возврата.",
    )


def _dead_end(sid: str, oid: str | None) -> Issue:
    return Issue(
        "missing_next",
        sid,
        oid,
        "После ответа бот не знает, куда идти. Выберите следующий шаг.",
    )


def _targets_of(s: Scenario, target: Target | None) -> list[str]:
    if target is None:
        return []
    if isinstance(target, Call):
        found = [target.then] if target.then else []
        if target.block in s.blocks:
            found.append(s.blocks[target.block])
        return [t for t in found if t != RETURN]
    return [] if target == RETURN else [target]

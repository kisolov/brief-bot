"""Проверка сценария: ошибки, которые редактор показывает заказчику."""

import re
from dataclasses import dataclass

from src.scenario.entities import RETURN, Call, Option, Scenario, Step, StepType, Target

_ID_RE = re.compile(r"[a-z0-9_]{1,24}")
_CALLBACK_LIMIT = 64
_LABEL_LIMIT = 40

# Типы, где переход задаёт опция. У остальных переход только по next шага.
_OPTION_NEXT_TYPES = (StepType.CHOICE, StepType.INFO)
_OPTIONS_REQUIRED = (StepType.CHOICE, StepType.MULTI, StepType.MULTI_INPUT)


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
        # Шаг с условием пропускается по next, поэтому next нужен любому такому шагу.
        if step.next is None and (
            step.when is not None
            or step.type in (StepType.TEXT, StepType.FILE, StepType.MULTI, StepType.MULTI_INPUT)
        ):
            issues.append(
                Issue(
                    "missing_next",
                    sid,
                    None,
                    "После ответа бот не знает, куда идти. Выберите следующий шаг.",
                )
            )
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
    return issues


def _check_option(s: Scenario, step: Step, opt: Option) -> list[Issue]:
    sid = step.id
    issues: list[Issue] = []
    if not _ID_RE.fullmatch(opt.id):
        issues.append(_bad_id(sid, opt.id, "кнопки"))
    if opt.when and opt.when.step not in s.steps:
        issues.append(_when_unknown(sid, opt.id))
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
    if opt.next is None and opt.url is None and (step.type in _OPTION_NEXT_TYPES or step.finish):
        issues.append(
            Issue(
                "missing_next",
                sid,
                opt.id,
                f'Кнопка "{opt.label}" никуда не ведёт. Выберите следующий шаг.',
            )
        )
    return issues


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
        targets = [step.next]
        if step.type in _OPTION_NEXT_TYPES or step.finish:
            targets.extend(o.next for o in step.options)
        for t in targets:
            stack.extend(_targets_of(s, t))
    return seen


def _targets_of(s: Scenario, target: Target | None) -> list[str]:
    if target is None:
        return []
    if isinstance(target, Call):
        found = [target.then] if target.then else []
        if target.block in s.blocks:
            found.append(s.blocks[target.block])
        return [t for t in found if t != RETURN]
    return [] if target == RETURN else [target]

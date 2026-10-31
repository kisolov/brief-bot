"""Проверка условий показа: противоречия и условия, которые никогда не выполнятся.

Условие есть у шага и у кнопки, правила одни. Пути между шагами берутся с запасом:
лучше пропустить редкий случай, чем запретить рабочий сценарий.
"""

from collections import deque
from dataclasses import dataclass

from src.scenario.entities import RETURN, Call, Scenario, Step, StepType, Target, When


@dataclass(frozen=True)
class WhenProblem:
    code: str
    step_id: str
    option_id: str | None
    message: str


_Owner = tuple[str, str | None]


def check_conditions(s: Scenario) -> list[WhenProblem]:
    """Проблемы условий в порядке шагов; условие на несуществующий шаг здесь молчит."""
    conds = _conditions(s)
    paths = _Paths(s)
    problems: list[WhenProblem] = []
    own: set[_Owner] = set()

    for (sid, oid), w in conds.items():
        if w.step not in s.steps:
            own.add((sid, oid))
            continue
        found = _own_problems(s, sid, oid, w, paths)
        if found:
            own.add((sid, oid))
        problems.extend(found)

    problems.extend(_never(s, conds, own))
    problems.extend(_option_conflicts(s, conds))
    return _in_step_order(s, problems)


def _conditions(s: Scenario) -> dict[_Owner, When]:
    found: dict[_Owner, When] = {}
    for sid, step in s.steps.items():
        if step.when is not None:
            found[(sid, None)] = step.when
        for opt in step.options:
            if opt.when is not None:
                found[(sid, opt.id)] = opt.when
    return found


def _own_problems(
    s: Scenario, sid: str, oid: str | None, w: When, paths: "_Paths"
) -> list[WhenProblem]:
    kind = _Kind(oid is not None)
    question = s.steps[w.step]
    out: list[WhenProblem] = []
    if set(w.any) & set(w.none):
        out.append(WhenProblem("when_conflict", sid, oid, kind.conflict))
    if not w.any:
        out.append(WhenProblem("when_empty", sid, oid, kind.empty))
    known = {o.id for o in question.options}
    if any(i not in known for i in (*w.any, *w.none)):
        out.append(
            WhenProblem(
                "when_unknown_answer", sid, oid, "В условии остался ответ, которого больше нет."
            )
        )
    if w.step == sid:
        out.append(WhenProblem("when_self", sid, oid, kind.self_ref))
    elif not paths.reaches(w.step, sid):
        out.append(WhenProblem("when_not_before", sid, oid, kind.not_before))
    return out


class _Kind:
    """Тексты для шага или для кнопки: заказчик видит слово "кнопка"."""

    def __init__(self, is_option: bool) -> None:
        self.conflict = 'Один и тот же ответ отмечен и в "если отмечено", и в "не отмечено".'
        if is_option:
            self.empty = "В условии не отмечен ни один ответ, эта кнопка никогда не покажется."
            self.self_ref = "Условие кнопки не может зависеть от ответа на этот же шаг."
            self.not_before = (
                "Вопрос из условия не стоит раньше этой кнопки, ответа на него не будет."
            )
            self.never = "Эта кнопка никогда не покажется: ответ из условия недостижим."
        else:
            self.empty = "В условии не отмечен ни один ответ, этот шаг никогда не покажется."
            self.self_ref = "Условие не может зависеть от ответа на этот же шаг."
            self.not_before = (
                "Вопрос из условия не стоит раньше этого шага, ответа на него не будет."
            )
            self.never = "Этот шаг никогда не покажется: ответ из условия недостижим."


def _allowed(w: When, question: Step) -> set[str]:
    """Ответы, при которых условие истинно. Несколько отметок в multi `none` не сужает."""
    ids = set(w.any)
    if question.type == StepType.CHOICE:
        ids -= set(w.none)
    return ids


def _never(s: Scenario, conds: dict[_Owner, When], own: set[_Owner]) -> list[WhenProblem]:
    """Неподвижная точка: что не покажется, если исключать невозможные ответы."""
    dead_steps: set[str] = set()
    dead_opts: set[_Owner] = set()

    def possible(sid: str) -> set[str]:
        if sid in dead_steps:
            return set()
        return {o.id for o in s.steps[sid].options if (sid, o.id) not in dead_opts}

    def cond_dead(w: When) -> bool:
        return w.step in s.steps and not (_allowed(w, s.steps[w.step]) & possible(w.step))

    changed = True
    while changed:
        changed = False
        for (sid, oid), w in conds.items():
            owner = (sid, oid)
            if not cond_dead(w):
                continue
            if oid is None and sid not in dead_steps:
                dead_steps.add(sid)
                changed = True
            elif oid is not None and owner not in dead_opts:
                dead_opts.add(owner)
                changed = True
        for sid in dead_steps:
            for opt in s.steps[sid].options:
                if (sid, opt.id) not in dead_opts:
                    dead_opts.add((sid, opt.id))
                    changed = True

    problems: list[WhenProblem] = []
    for (sid, oid), w in conds.items():
        owner = (sid, oid)
        if owner in own or not cond_dead(w):
            continue
        if oid is None and sid in dead_steps:
            problems.append(WhenProblem("when_never", sid, None, _Kind(False).never))
        elif oid is not None:
            problems.append(WhenProblem("when_never", sid, oid, _Kind(True).never))
    return problems


def _option_conflicts(s: Scenario, conds: dict[_Owner, When]) -> list[WhenProblem]:
    problems: list[WhenProblem] = []
    for (sid, oid), v in conds.items():
        w = conds.get((sid, None))
        if oid is None or w is None or w.step != v.step or v.step not in s.steps:
            continue
        question = s.steps[v.step]
        if question.type != StepType.CHOICE:
            continue
        a, b = _allowed(w, question), _allowed(v, question)
        # Пустое одно из условий уже получило свою ошибку.
        if a and b and not a & b:
            problems.append(
                WhenProblem(
                    "when_option_conflict",
                    sid,
                    oid,
                    "Эта кнопка никогда не покажется: её условие противоречит условию шага.",
                )
            )
    return problems


def _in_step_order(s: Scenario, problems: list[WhenProblem]) -> list[WhenProblem]:
    order = {sid: i for i, sid in enumerate(s.steps)}
    return sorted(problems, key=lambda p: order.get(p.step_id, len(order)))


class _Paths:
    """Есть ли путь от одного шага к другому, с запасом."""

    def __init__(self, s: Scenario) -> None:
        self._edges = _build_edges(s)
        self._memo: dict[str, set[str]] = {}

    def reaches(self, src: str, dst: str) -> bool:
        return dst in self._from(src)

    def _from(self, src: str) -> set[str]:
        if src in self._memo:
            return self._memo[src]
        seen: set[str] = set()
        queue = deque(self._edges.get(src, ()))
        while queue:
            sid = queue.popleft()
            if sid in seen:
                continue
            seen.add(sid)
            queue.extend(self._edges.get(sid, ()))
        self._memo[src] = seen
        return seen


def _targets(step: Step) -> list[Target]:
    # Опции любого типа: завышение безопасно.
    found = [step.next, *(o.next for o in step.options)]
    return [t for t in found if t is not None]


def _build_edges(s: Scenario) -> dict[str, set[str]]:
    edges: dict[str, set[str]] = {sid: set() for sid in s.steps}
    sites: list[tuple[str, Call]] = []
    returners: dict[str, bool] = {}
    for sid, step in s.steps.items():
        for t in _targets(step):
            if t == RETURN:
                returners[sid] = True
            elif isinstance(t, Call):
                sites.append((sid, t))
                entry = s.blocks.get(t.block)
                if entry in s.steps:
                    edges[sid].add(entry)
                if t.then not in (None, RETURN) and t.then in s.steps:
                    edges[sid].add(t.then)
            elif t in s.steps:
                edges[sid].add(t)

    members = {name: _reach(edges, entry) for name, entry in s.blocks.items() if entry in s.steps}
    back: dict[str, set[str]] = {name: set() for name in members}
    changed = True
    while changed:
        changed = False
        for sid, call in sites:
            if call.block not in back:
                continue
            if call.then not in (None, RETURN):
                new = {call.then} & set(s.steps)
            else:
                # Возврат без then идёт туда же, куда вернётся блок, из которого вызвали.
                new = set().union(*(back[b] for b, m in members.items() if sid in m))
            if not new <= back[call.block]:
                back[call.block] |= new
                changed = True

    for name, steps in members.items():
        for sid in steps:
            if sid in returners:
                edges[sid] |= back[name]
    return edges


def _reach(edges: dict[str, set[str]], entry: str) -> set[str]:
    seen = {entry}
    stack = [entry]
    while stack:
        for nxt in edges.get(stack.pop(), ()):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return seen

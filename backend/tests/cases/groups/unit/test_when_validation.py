"""Противоречивые условия показа: публикация их не пропускает, движок каскад пропуска держит."""

from dataclasses import replace

import pytest

from src.dialog.engine import new_session, step
from src.dialog.entities import Event
from src.scenario.entities import RETURN, Call, Option, Scenario, Step, StepType, When
from src.scenario.seed import load_seed
from src.scenario.validator import validate_scenario


def _scn(steps: list[Step], entry: str = "q", blocks: dict | None = None) -> Scenario:
    return Scenario(version=1, entry=entry, blocks=blocks or {}, steps={s.id: s for s in steps})


def _end() -> Step:
    return Step(id="end", type=StepType.INFO, text="Спасибо", finish=True)


def _q(next_: str = "x", kind: StepType = StepType.CHOICE) -> Step:
    """Вопрос q с ответами y и n."""
    choice = kind == StepType.CHOICE
    return Step(
        id="q",
        type=kind,
        text="?",
        key=None if choice else "Вопрос",
        next=None if choice else next_,
        options=(Option(id="y", label="Да", next=next_), Option(id="n", label="Нет", next=next_)),
    )


def _x(when: When | None = None, options: tuple[Option, ...] = ()) -> Step:
    """Шаг x после вопроса; с кнопками это choice."""
    return Step(
        id="x",
        type=StepType.CHOICE if options else StepType.TEXT,
        text="?",
        key=None if options else "Ответ",
        next="end",
        when=when,
        options=options,
    )


def _codes(s: Scenario) -> list[tuple[str, str, str | None]]:
    return [(i.code, i.step_id, i.option_id) for i in validate_scenario(s)]


def _where(s: Scenario, code: str) -> list[tuple[str, str | None]]:
    return [(i.step_id, i.option_id) for i in validate_scenario(s) if i.code == code]


def _message(s: Scenario, code: str) -> str:
    return next(i.message for i in validate_scenario(s) if i.code == code)


def _btn(when: When | None, oid: str = "b") -> Option:
    return Option(id=oid, label="Кнопка", next="end", when=when)


# --- по одному коду, для шага и для кнопки ---


def test_valid_conditions_have_no_issues():
    s = _scn([_q(), _x(When("q", ("y",), ("n",))), _end()])
    assert validate_scenario(s) == []


def test_conflict_on_step():
    s = _scn([_q(), _x(When("q", ("y",), ("y",))), _end()])
    assert _where(s, "when_conflict") == [("x", None)]
    assert _message(s, "when_conflict") == (
        'Один и тот же ответ отмечен и в "если отмечено", и в "не отмечено".'
    )


def test_conflict_on_option():
    s = _scn([_q(), _x(options=(_btn(When("q", ("y",), ("y",))),)), _end()])
    assert _where(s, "when_conflict") == [("x", "b")]


def test_empty_on_step():
    s = _scn([_q(), _x(When("q", (), ("n",))), _end()])
    assert _where(s, "when_empty") == [("x", None)]
    assert _message(s, "when_empty") == (
        "В условии не отмечен ни один ответ, этот шаг никогда не покажется."
    )


def test_empty_on_option():
    s = _scn([_q(), _x(options=(_btn(When("q", ())),)), _end()])
    assert _where(s, "when_empty") == [("x", "b")]
    assert "кнопка" in _message(s, "when_empty")


@pytest.mark.parametrize("w", [When("q", ("gone",)), When("q", ("y",), ("gone",))])
def test_unknown_answer_on_step(w):
    s = _scn([_q(), _x(w), _end()])
    assert _where(s, "when_unknown_answer") == [("x", None)]
    assert _message(s, "when_unknown_answer") == "В условии остался ответ, которого больше нет."


def test_unknown_answer_on_option():
    s = _scn([_q(), _x(options=(_btn(When("q", ("gone",))),)), _end()])
    assert _where(s, "when_unknown_answer") == [("x", "b")]


def test_unknown_answer_when_question_has_no_options():
    q = Step(id="q", type=StepType.TEXT, text="?", key="К", next="x")
    s = _scn([q, _x(When("q", ("y",))), _end()])
    assert _where(s, "when_unknown_answer") == [("x", None)]


def test_self_on_step_and_option():
    s = _scn(
        [
            _q(),
            _x(
                When("x", ("a",)),
                options=(Option(id="a", label="A", next="end"), _btn(When("x", ("a",)))),
            ),
            _end(),
        ]
    )
    assert _where(s, "when_self") == [("x", None), ("x", "b")]
    assert _message(s, "when_self") == "Условие не может зависеть от ответа на этот же шаг."


def test_not_before_on_step():
    # q идёт после x: ответа на него ещё нет.
    x = Step(id="x", type=StepType.TEXT, key="К", text="?", next="q", when=When("q", ("y",)))
    s = _scn([x, _q(next_="end"), _end()], entry="x")
    assert _where(s, "when_not_before") == [("x", None)]
    assert _message(s, "when_not_before") == (
        "Вопрос из условия не стоит раньше этого шага, ответа на него не будет."
    )


def test_not_before_on_option():
    x = Step(
        id="x",
        type=StepType.CHOICE,
        text="?",
        options=(Option(id="b", label="B", next="q", when=When("q", ("y",))),),
    )
    s = _scn([x, _q(next_="end"), _end()], entry="x")
    assert _where(s, "when_not_before") == [("x", "b")]
    assert "кнопки" in _message(s, "when_not_before")


def _dead_answer_steps() -> list[Step]:
    """Единственный ответ a вопроса p скрыт противоречивым условием."""
    p = Step(
        id="p",
        type=StepType.CHOICE,
        text="?",
        options=(Option(id="a", label="A", next="x", when=When("q", ("y",), ("y",))),),
    )
    return [_q(next_="p"), p]


def test_never_on_step_when_answer_is_hidden():
    s = _scn([*_dead_answer_steps(), _x(When("p", ("a",))), _end()])
    # Первопричина у кнопки a, шаг x получает when_never.
    assert _where(s, "when_conflict") == [("p", "a")]
    assert _where(s, "when_never") == [("x", None)]
    assert _message(s, "when_never") == (
        "Этот шаг никогда не покажется: ответ из условия недостижим."
    )


def test_never_on_option_when_answer_is_hidden():
    x = _x(options=(_btn(When("p", ("a",))),))
    s = _scn([*_dead_answer_steps(), x, _end()])
    assert _where(s, "when_never") == [("x", "b")]
    assert _message(s, "when_never") == (
        "Эта кнопка никогда не покажется: ответ из условия недостижим."
    )


def test_cause_is_not_reported_twice():
    s = _scn([_q(), _x(When("q", ("y",), ("y",))), _end()])
    assert _codes(s) == [("when_conflict", "x", None)]


def test_option_conflict_with_step_condition():
    x = _x(
        When("q", ("y",)),
        options=(_btn(When("q", ("n",))), Option(id="ok", label="Ok", next="end")),
    )
    s = _scn([_q(), x, _end()])
    assert _where(s, "when_option_conflict") == [("x", "b")]
    assert _message(s, "when_option_conflict") == (
        "Эта кнопка никогда не покажется: её условие противоречит условию шага."
    )


def test_option_conflict_through_none():
    x = _x(
        When("q", ("y", "n"), ("n",)),
        options=(_btn(When("q", ("n",))), Option(id="ok", label="Ok", next="end")),
    )
    s = _scn([_q(), x, _end()])
    assert _where(s, "when_option_conflict") == [("x", "b")]


def test_option_with_overlapping_condition_is_fine():
    x = _x(
        When("q", ("y", "n")),
        options=(_btn(When("q", ("n",))), Option(id="ok", label="Ok", next="end")),
    )
    assert validate_scenario(_scn([_q(), x, _end()])) == []


def test_multi_none_does_not_narrow_possible_answers():
    # В multi человек может отметить и y, и n: none не делает условие невыполнимым.
    s = _scn([_q(kind=StepType.MULTI), _x(When("q", ("n",), ("y",))), _end()])
    assert validate_scenario(s) == []


# --- каскад ---


def test_never_cascades_through_three_steps():
    # a скрыт противоречием, b ждёт ответа на a, c ждёт ответа на b.
    a = Step(
        id="a",
        type=StepType.CHOICE,
        text="A",
        when=When("q", ("y",), ("y",)),
        next="b",
        options=(Option(id="a1", label="A1", next="b"),),
    )
    b = Step(
        id="b",
        type=StepType.CHOICE,
        text="B",
        when=When("a", ("a1",)),
        next="c",
        options=(Option(id="b1", label="B1", next="c"),),
    )
    c = Step(id="c", type=StepType.TEXT, text="C", key="C", when=When("b", ("b1",)), next="end")
    s = _scn([_q(next_="a"), a, b, c, _end()])
    assert _codes(s) == [
        ("when_conflict", "a", None),
        ("when_never", "b", None),
        ("when_never", "c", None),
    ]


def test_hidden_steps_are_skipped_by_engine():
    """A скрыт, B с условием на A скрыт, C без условия показан, анкета идёт дальше."""
    a = Step(
        id="a",
        type=StepType.CHOICE,
        text="A",
        when=When("q", ("y",)),
        next="b",
        options=(Option(id="a1", label="A1", next="b"),),
    )
    b = Step(id="b", type=StepType.TEXT, text="B", key="B", when=When("a", ("a1",)), next="c")
    c = Step(id="c", type=StepType.TEXT, text="C", key="C", next="end")
    sc = _scn([_q(next_="a"), a, b, c, _end()])
    assert validate_scenario(sc) == []
    result = step(sc, new_session(sc, 1), Event("button", step="q", value="n"))
    assert result.session.step == "c"
    result = step(sc, result.session, Event("text", step="c", value="ответ"))
    assert result.session.step == "end"
    assert result.session.finished


# --- пути ---


def test_hub_cycle_gives_no_false_errors():
    hub = Step(
        id="q",
        type=StepType.CHOICE,
        text="Раздел?",
        options=(
            Option(id="s1", label="Один", next="one"),
            Option(id="s2", label="Два", next="two"),
            Option(id="done", label="Хватит", next="end", when=When("one", ("ok",))),
        ),
    )
    one = Step(
        id="one",
        type=StepType.CHOICE,
        text="?",
        options=(Option(id="ok", label="Ok", next="q"),),
    )
    two = Step(
        id="two",
        type=StepType.CHOICE,
        text="?",
        when=When("one", ("ok",)),
        next="q",
        options=(Option(id="ok", label="Ok", next="q"),),
    )
    assert validate_scenario(_scn([hub, one, two, _end()])) == []


def _inner() -> Step:
    return Step(
        id="inner",
        type=StepType.CHOICE,
        text="?",
        options=(Option(id="y", label="Да", next=RETURN),),
    )


def _after(sid: str) -> Step:
    return Step(
        id=sid,
        type=StepType.TEXT,
        text="?",
        key=sid,
        when=When("inner", ("y",)),
        next="end",
    )


def test_condition_on_question_inside_block_from_step_after_block():
    q = Step(id="q", type=StepType.TEXT, key="К", text="?", next=Call("blk", then="after"))
    sc = _scn([q, _inner(), _after("after"), _end()], blocks={"blk": "inner"})
    assert validate_scenario(sc) == []


def test_return_goes_to_every_then_of_the_block():
    q = Step(
        id="q",
        type=StepType.CHOICE,
        text="?",
        options=(
            Option(id="l", label="Влево", next=Call("blk", then="left")),
            Option(id="r", label="Вправо", next=Call("blk", then="right")),
        ),
    )
    sc = _scn([q, _inner(), _after("left"), _after("right"), _end()], blocks={"blk": "inner"})
    assert validate_scenario(sc) == []


def test_step_before_block_cannot_depend_on_answer_inside_it():
    q = replace(_after("q"), next=Call("blk", then="end"))
    sc = _scn([q, _inner(), _end()], blocks={"blk": "inner"})
    assert _where(sc, "when_not_before") == [("q", None)]


def test_nested_call_without_then_returns_to_outer_then():
    q = Step(id="q", type=StepType.TEXT, key="К", text="?", next=Call("outer", then="after"))
    o1 = Step(id="o1", type=StepType.TEXT, key="О", text="?", next=Call("inner"))
    inner = replace(_inner(), id="i1")
    after = replace(_after("after"), when=When("i1", ("y",)))
    sc = _scn([q, o1, inner, after, _end()], blocks={"outer": "o1", "inner": "i1"})
    assert validate_scenario(sc) == []


# --- раунд исправлений ---


def test_final_button_does_not_hide_not_before():
    # Кнопка финала начинает новый проход с пустыми ответами: пути к x из неё нет.
    x = Step(id="x", type=StepType.TEXT, key="К", text="?", next="q", when=When("q", ("y",)))
    fin = Step(
        id="fin",
        type=StepType.INFO,
        text="Спасибо",
        finish=True,
        options=(Option(id="again", label="Заново", next="x"),),
    )
    s = _scn([x, _q(next_="fin"), fin], entry="x")
    assert _where(s, "when_not_before") == [("x", None)]


def test_block_entered_from_final_button_keeps_its_return_edges():
    # Новый проход идёт через блок, поэтому ответ b1 к шагу m будет.
    q = Step(id="q", type=StepType.TEXT, key="К", text="?", next="fin")
    fin = Step(
        id="fin",
        type=StepType.INFO,
        text="Спасибо",
        finish=True,
        options=(Option(id="again", label="Заново", next=Call("blk", then="m")),),
    )
    b1 = Step(
        id="b1",
        type=StepType.CHOICE,
        text="?",
        options=(Option(id="p", label="P", next="b2"),),
    )
    b2 = Step(id="b2", type=StepType.TEXT, key="Б", text="?", next=RETURN)
    m = Step(id="m", type=StepType.TEXT, key="М", text="?", when=When("b1", ("p",)), next="end")
    s = _scn([q, fin, b1, b2, m, _end()], blocks={"blk": "b1"})
    assert _where(s, "when_not_before") == []


def test_never_after_option_hidden_by_step_condition():
    # Кнопка b противоречит условию шага x, значит, ответа b не будет и шаг y не покажется.
    x = Step(
        id="x",
        type=StepType.CHOICE,
        text="?",
        when=When("q", ("y",)),
        next="end",
        options=(Option(id="b", label="B", next="y", when=When("q", ("n",))),),
    )
    y = Step(id="y", type=StepType.TEXT, key="Y", text="?", when=When("x", ("b",)), next="end")
    s = _scn([_q(), x, y, _end()])
    assert _where(s, "when_option_conflict") == [("x", "b")]
    assert _where(s, "when_never") == [("y", None)]


def test_never_when_depending_on_info_answer():
    q = Step(
        id="q",
        type=StepType.INFO,
        text="Сообщение",
        options=(Option(id="go", label="Дальше", next="x"),),
    )
    s = _scn([q, _x(When("q", ("go",))), _end()])
    assert _where(s, "when_never") == [("x", None)]


# --- сид ---


def test_seed_has_no_issues():
    assert validate_scenario(load_seed()) == []

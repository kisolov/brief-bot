"""Условие none и конечный шаг с кнопками."""

from dataclasses import replace

from src.dialog.engine import new_session, render, step
from src.dialog.entities import Effect, Event, StepResult
from src.scenario.entities import Option, Scenario, Step, StepType, When
from src.scenario.parser import dump_scenario, parse_scenario
from src.scenario.validator import validate_scenario


def _none_scenario() -> Scenario:
    steps = [
        Step(
            id="pick",
            type=StepType.MULTI,
            text="Что?",
            key="Выбор",
            options=(
                Option(id="a", label="A"),
                Option(id="b", label="B"),
                Option(id="c", label="C"),
            ),
            next="ask",
        ),
        Step(
            id="ask",
            type=StepType.TEXT,
            text="Ссылка?",
            key="Ссылка",
            when=When("pick", ("b", "c"), ("a",)),
            next="end",
        ),
        Step(id="end", type=StepType.INFO, text="Конец.", finish=True),
    ]
    return Scenario(version=1, entry="pick", blocks={}, steps={s.id: s for s in steps})


def _pick(*ids: str) -> str:
    sc = _none_scenario()
    session = new_session(sc, 1)
    result = StepResult(session, render(sc, session), ())
    for i in ids:
        result = step(sc, result.session, Event("button", step="pick", value=i))
    return step(sc, result.session, Event("done", step="pick")).session.step


def test_when_none_blocks_step():
    assert _pick("b") == "ask"
    assert _pick("a", "b") == "end"
    assert _pick("a") == "end"


def test_when_none_roundtrips_in_parser():
    data = dump_scenario(_none_scenario())
    assert data["steps"]["ask"]["when"]["none"] == ["a"]
    assert parse_scenario(data, 1) == _none_scenario()
    data["steps"]["ask"]["when"].pop("none")
    assert "none" not in dump_scenario(parse_scenario(data, 1))["steps"]["ask"]["when"]


def _finish_scenario() -> Scenario:
    steps = [
        Step(
            id="menu",
            type=StepType.CHOICE,
            text="Меню",
            key="Направление",
            no_back=True,
            options=(Option(id="go", label="Начать", next="name"),),
        ),
        Step(id="name", type=StepType.TEXT, text="Имя?", key="name", next="thanks"),
        Step(
            id="thanks",
            type=StepType.INFO,
            text="Спасибо, {name}!",
            finish=True,
            options=(
                Option(id="home", label="В меню", next="menu"),
                Option(id="site", label="Сайт", url="https://example.com"),
                Option(id="again", label="Ещё раз", next="name"),
            ),
        ),
    ]
    return Scenario(version=7, entry="menu", blocks={}, steps={s.id: s for s in steps})


def _finished():
    sc = _finish_scenario()
    session = new_session(sc, 1)
    result = StepResult(session, render(sc, session), ())
    for ev in (Event("button", step="menu", value="go"), Event("text", value="Анна")):
        result = step(sc, result.session, ev)
    return sc, result


def test_finish_step_shows_buttons_and_finishes():
    _, r = _finished()
    assert r.session.finished and r.effects == (Effect.FINISHED,)
    assert [b.id for b in r.screen.buttons] == ["home", "site", "again"]
    assert r.screen.can_back is False
    assert r.screen.text == "Спасибо, Анна!"


def test_final_buttons_start_new_passage():
    sc, r = _finished()
    r2 = step(sc, replace(r.session, reminded=True), Event("button", step="thanks", value="home"))
    s = r2.session
    assert r2.effects == (Effect.PROGRESS,)
    assert s.step == "menu" and s.finished is False and s.reminded is False
    assert s.answers == {} and s.history == () and s.returns == ()
    assert s.history_returns == () and s.history_answers == () and s.pending_input is None
    # step() чистый: выбор текущей версии делает DialogService.apply.
    assert s.version == 7 and s.chat_id == 1
    assert [b.id for b in r2.screen.buttons] == ["go"]
    assert r2.screen.can_back is False


def test_final_button_to_text_step_and_ignored_events():
    sc, r = _finished()
    r2 = step(sc, r.session, Event("button", step="thanks", value="again"))
    assert r2.session.step == "name" and r2.screen.expects == "text"
    for ev in (
        Event("button", step="thanks", value="site"),
        Event("button", step="menu", value="home"),
        Event("button", step="thanks", value="zzz"),
        Event("text", value="x"),
        Event("back", step="thanks"),
    ):
        same = step(sc, r.session, ev)
        assert same.session == r.session and same.effects == ()


def test_back_to_seeds_history_of_new_passage():
    sc, r = _finished()
    sc = replace(sc, steps={**sc.steps, "thanks": replace(sc.steps["thanks"], back_to="menu")})
    again = step(sc, r.session, Event("button", step="thanks", value="again"))
    s = again.session
    assert s.step == "name" and s.history == ("menu",)
    assert s.history_returns == ((),) and s.history_answers == ((),) and s.answers == {}
    assert again.screen.can_back
    back = step(sc, s, Event("back", step="name"))
    assert back.session.step == "menu" and back.session.history == ()
    # Цель, равная back_to, историю не засевает.
    home = step(sc, r.session, Event("button", step="thanks", value="home"))
    assert home.session.history == ()


def test_back_to_roundtrips_and_is_validated():
    sc = _finish_scenario()
    bad = replace(sc, steps={**sc.steps, "thanks": replace(sc.steps["thanks"], back_to="zzz")})
    assert [i.code for i in validate_scenario(bad)] == ["missing_target"]
    good = replace(sc, steps={**sc.steps, "thanks": replace(sc.steps["thanks"], back_to="menu")})
    data = dump_scenario(good)
    assert data["steps"]["thanks"]["back_to"] == "menu"
    assert parse_scenario(data, 7) == good
    assert "back_to" not in dump_scenario(sc)["steps"]["thanks"]


def test_finish_step_options_validated():
    sc = _finish_scenario()
    assert validate_scenario(sc) == []
    bad = replace(sc.steps["thanks"], options=(Option(id="x", label="Куда"),))
    broken = replace(sc, steps={**sc.steps, "thanks": bad})
    assert [i.code for i in validate_scenario(broken)] == ["missing_next"]

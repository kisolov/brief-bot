import dataclasses
import json
from dataclasses import replace

from src.dialog.engine import new_session, render, step
from src.dialog.entities import Effect, Event, Session, StepResult, answer_text
from src.scenario.entities import Call, Option, Scenario, When
from src.scenario.validator import validate_scenario
from tests.utils.sample_scenario import sample_scenario

S = sample_scenario()
PHONE = "+7 999 123-45-67"


def _run(*events: Event, session: Session | None = None) -> StepResult:
    session = session or new_session(S, chat_id=1)
    result = StepResult(session, render(S, session), ())
    for ev in events:
        result = step(S, result.session, ev)
    return result


def _btn(step_id: str, option: str) -> Event:
    return Event("button", step=step_id, value=option)


def _text(value: str) -> Event:
    return Event("text", value=value)


def _to_branch() -> tuple[Event, ...]:
    return _btn("privacy", "ok"), _text("Анна")


def _to_hub() -> tuple[Event, ...]:
    return (*_to_branch(), _btn("branch", "new"))


def _to_extras(promo: str = "paid") -> tuple[Event, ...]:
    return (*_to_branch(), _btn("branch", "old"), _btn("promo_now", promo), _btn("sphere", "shop"))


def _to_ready() -> tuple[Event, ...]:
    return (*_to_hub(), _btn("hub", "go"), _text(PHONE), Event("file", value="F1"))


def _checked(result: StepResult) -> set[str]:
    return {b.id for b in result.screen.buttons if b.checked}


def test_sample_scenario_is_valid():
    assert validate_scenario(S) == []


def test_choice_moves_to_next():
    r = _run(_btn("privacy", "ok"))
    assert r.session.step == "name"
    assert r.session.answers["privacy"].ids == ("ok",)
    assert r.screen.expects == "text"
    assert r.screen.edit is False


def test_back_returns_to_previous():
    r = _run(_btn("privacy", "ok"), Event("back", step="name"))
    assert r.session.step == "privacy"
    assert "privacy" in r.session.answers
    assert r.session.history == ()


def test_back_removes_answer_of_left_step_only():
    r = _run(*_to_hub(), _btn("hub", "go"), _text(PHONE))
    assert r.session.step == "docs"
    r = step(S, r.session, Event("back", step="docs"))
    assert r.session.step == "contact"
    assert "docs" not in r.session.answers
    assert "contact" in r.session.answers
    r = step(S, r.session, Event("back", step="contact"))
    assert "contact" not in r.session.answers
    assert r.session.step == "hub"
    assert "name" in r.session.answers and "branch" in r.session.answers


def test_no_back_on_first_step():
    r = _run()
    assert r.screen.can_back is False
    r2 = step(S, r.session, Event("back", step="privacy"))
    assert r2.session == r.session
    assert r2.effects == ()


def test_no_back_flag():
    sc = replace(S, steps={**S.steps, "name": replace(S.steps["name"], no_back=True)})
    r = step(sc, new_session(sc, 1), _btn("privacy", "ok"))
    assert r.screen.can_back is False


def test_call_block_returns_to_then():
    r = _run(*_to_branch(), _btn("branch", "old"), _btn("promo_now", "paid"))
    assert r.session.step == "sphere"
    assert r.session.returns == ("extras",)
    r = step(S, r.session, _btn("sphere", "shop"))
    assert r.session.step == "extras"
    assert r.session.returns == ()


def test_back_inside_block_after_return():
    r = _run(*_to_extras())
    assert r.session.step == "extras"
    r = step(S, r.session, Event("back", step="extras"))
    assert r.session.step == "sphere"
    assert r.session.returns == ("extras",)
    r = step(S, r.session, _btn("sphere", "svc"))
    assert r.session.step == "extras"
    assert r.session.returns == ()


def test_history_snapshots_are_parallel_and_json_friendly():
    r = _run(*_to_extras())
    assert len(r.session.history) == len(r.session.history_returns)
    assert all(isinstance(x, tuple) for x in r.session.history_returns)


def test_revisit_truncates_history():
    r = _run(*_to_hub())
    base = r.session.history
    r = step(S, r.session, _btn("hub", "cat"))
    r = step(S, r.session, Event("done", step="cat"))
    assert r.session.step == "hub"
    assert r.session.history == base
    r = step(S, r.session, Event("back", step="hub"))
    assert r.session.step == "branch"


def test_revisit_keeps_category_answers():
    r = _run(*_to_hub(), _btn("hub", "cat"), _btn("cat", "a1"), Event("done", step="cat"))
    assert r.session.step == "hub"
    assert r.session.answers["cat"].ids == ("a1",)


def test_multi_toggle_edits_message():
    r = _run(*_to_hub(), _btn("hub", "cat"), _btn("cat", "a1"))
    assert r.screen.edit is True
    assert _checked(r) == {"a1"}
    r = step(S, r.session, _btn("cat", "a2"))
    assert _checked(r) == {"a1", "a2"}
    r = step(S, r.session, _btn("cat", "a1"))
    assert _checked(r) == {"a2"}
    assert r.screen.can_done is True


def test_multi_done_without_marks():
    r = _run(*_to_hub(), _btn("hub", "cat"), Event("done", step="cat"))
    assert r.session.step == "hub"


def test_exclusive_clears_others():
    r = _run(*_to_hub(), _btn("hub", "cat"), _btn("cat", "a1"), _btn("cat", "none"))
    assert _checked(r) == {"none"}


def test_other_clears_exclusive():
    r = _run(*_to_hub(), _btn("hub", "cat"), _btn("cat", "none"), _btn("cat", "a1"))
    assert _checked(r) == {"a1"}


def test_multi_input_asks_text_on_toggle():
    r = _run(*_to_extras(), _btn("extras", "other"))
    assert r.session.pending_input == "other"
    assert r.screen.expects == "text"
    assert r.screen.text == "Напишите, что именно"
    assert r.screen.buttons == ()
    assert r.screen.can_back is True
    r = step(S, r.session, _text("  Чат-бот  "))
    assert r.session.pending_input is None
    assert r.session.answers["extras"].texts == {"other": "Чат-бот"}
    assert r.screen.edit is False
    assert _checked(r) == {"other"}


def test_back_on_input_unchecks():
    r = _run(*_to_extras(), _btn("extras", "logo"), _btn("extras", "other"))
    history = r.session.history
    r = step(S, r.session, Event("back", step="extras"))
    assert r.session.pending_input is None
    assert r.session.step == "extras"
    assert r.session.history == history
    assert _checked(r) == {"logo"}


def test_untoggle_input_option_drops_text():
    r = _run(*_to_extras(), _btn("extras", "other"), _text("x"), _btn("extras", "other"))
    assert "extras" not in r.session.answers


def test_when_skips_step():
    r = _run(*_to_extras("never"), Event("done", step="extras"))
    assert r.session.step == "contact"
    assert "promo_link" not in r.session.history


def test_not_skipped_when_condition_met():
    r = _run(*_to_extras("paid"), Event("done", step="extras"))
    assert r.session.step == "promo_link"


def test_when_hides_option():
    paid = _run(*_to_extras("paid"))
    never = _run(*_to_extras("never"))
    assert "paid_only" in [b.id for b in paid.screen.buttons]
    assert "paid_only" not in [b.id for b in never.screen.buttons]
    r = step(S, never.session, _btn("extras", "paid_only"))
    assert r.session == never.session
    assert r.effects == ()


def test_template_substitutes_name():
    r = _run(*_to_ready(), Event("done", step="ready"))
    assert r.session.finished is True
    assert r.screen.text == "Спасибо за заявку, Анна!"
    assert r.screen.can_done is False and r.screen.can_back is False


def test_template_keeps_unknown_key():
    sc = replace(S, steps={**S.steps, "name": replace(S.steps["name"], text="Привет {нет} {x y}")})
    r = step(sc, new_session(sc, 1), _btn("privacy", "ok"))
    assert r.screen.text == "Привет {нет} {x y}"


def test_phone_validation_reprompts():
    before = _run(*_to_hub(), _btn("hub", "go")).session
    for bad in ("abc", "12345", ""):
        r = step(S, before, _text(bad))
        assert r.session == before
        assert r.effects == ()
    r = step(S, before, _text("abc"))
    assert r.screen.text == (
        "Не похоже на номер телефона. Напишите номер в формате +7 999 999-99-99.\n\nВаш телефон?"
    )
    assert step(S, before, _text("+7 (999) 123-45-67")).session.step == "docs"


def test_url_validation():
    before = _run(*_to_extras("paid"), Event("done", step="extras")).session
    r = step(S, before, _text("не ссылка"))
    assert r.session == before
    assert r.screen.text.startswith(
        "Не похоже на ссылку. Напишите адрес сайта, например example.ru.\n\n"
    )
    for ok in ("example.ru", "https://a.b/c"):
        assert step(S, before, _text(ok)).session.step == "contact"


def test_text_when_button_expected_repeats_screen():
    r = _run()
    r2 = step(S, r.session, _text("привет"))
    assert r2.session == r.session
    assert r2.session.answers == {}
    assert r2.screen == r.screen
    assert r2.effects == ()


def test_stale_button_rerenders_current():
    r = _run(_btn("privacy", "ok"))
    r2 = step(S, r.session, _btn("old", "x"))
    assert r2.session == r.session
    assert r2.screen.step == "name"
    assert r2.effects == ()
    for kind in ("done", "back"):
        r3 = step(S, r.session, Event(kind, step="old"))
        assert r3.session == r.session and r3.effects == ()


def test_url_option_does_not_move():
    r = _run()
    assert r.screen.buttons[0].url == "https://example.ru/policy"
    r2 = step(S, r.session, _btn("privacy", "policy"))
    assert r2.session == r.session and r2.effects == ()


def test_start_shows_current_without_effects():
    r = _run(_btn("privacy", "ok"))
    r2 = step(S, r.session, Event("start"))
    assert r2.session == r.session and r2.screen.step == "name" and r2.effects == ()


def test_progress_effect():
    r = _run(_btn("privacy", "ok"))
    assert r.effects == (Effect.PROGRESS,)


def test_finished_effect():
    r = _run(*_to_ready(), Event("done", step="ready"))
    assert r.effects == (Effect.FINISHED,)
    r2 = step(S, r.session, _btn("fin", "x"))
    assert r2.session == r.session and r2.effects == ()
    r3 = step(S, r.session, _text("ещё"))
    assert r3.session == r.session and r3.effects == ()


def test_info_with_next_shows_continue():
    r = _run(*_to_ready())
    assert r.session.step == "ready"
    assert r.screen.can_done is True
    assert r.screen.done_label == "Продолжить"
    assert r.session.finished is False


def test_done_label_default_and_override():
    r = _run(*_to_hub(), _btn("hub", "cat"))
    assert r.screen.done_label == "Готово"
    sc = replace(S, steps={**S.steps, "cat": replace(S.steps["cat"], done_label="Хватит")})
    assert render(sc, replace(r.session)).done_label == "Хватит"


def test_return_on_empty_stack_keeps_step():
    sc = replace(S, steps={**S.steps, "name": replace(S.steps["name"], next="@return")})
    before = step(sc, new_session(sc, 1), _btn("privacy", "ok")).session
    r = step(sc, before, _text("Анна"))
    assert r.session == before
    assert r.effects == ()
    assert r.screen.step == "name"


def _with(step_id: str, **fields) -> Scenario:
    return replace(S, steps={**S.steps, step_id: replace(S.steps[step_id], **fields)})


def test_info_without_finish_does_not_end_survey():
    sc = _with("ready", next=None)
    s = replace(new_session(sc, 1), step="docs")
    r = step(sc, s, Event("file", value="F1"))
    assert r.session.step == "ready"
    assert r.session.finished is False
    assert r.effects == (Effect.PROGRESS,)
    assert new_session(replace(sc, entry="ready"), 1).finished is False


def test_finish_step_as_entry_finishes_at_once():
    assert new_session(replace(S, entry="fin"), 1).finished is True


LINK = Option(id="site", label="Сайт", url="https://example.com")
NAV = Option(id="go", label="Дальше", next="fin")


def test_link_button_keeps_continue_on_info_with_next():
    sc = _with("ready", options=(LINK,))
    s = replace(new_session(sc, 1), step="ready")
    assert render(sc, s).can_done is True
    r = step(sc, s, Event("done", step="ready"))
    assert r.session.step == "fin"


def test_navigation_button_removes_continue_on_info():
    sc = _with("ready", options=(LINK, NAV))
    s = replace(new_session(sc, 1), step="ready")
    assert render(sc, s).can_done is False
    r = step(sc, s, Event("done", step="ready"))
    assert r.session == s and r.effects == ()


def test_hidden_navigation_button_does_not_remove_continue():
    hidden = replace(NAV, when=When("privacy", ("nope",)))
    sc = _with("ready", options=(hidden,))
    s = replace(new_session(sc, 1), step="ready")
    assert render(sc, s).can_done is True
    assert step(sc, s, Event("done", step="ready")).session.step == "fin"


def test_repeated_choice_moves_answer_to_the_end():
    r = _run(*_to_hub(), _btn("hub", "go"))
    assert list(r.session.answers)[-1] == "hub"
    r = step(S, replace(r.session, step="branch"), _btn("branch", "old"))
    assert list(r.session.answers)[-1] == "branch"
    assert r.session.answers["branch"].ids == ("old",)


def test_call_without_then_returns_one_level_up():
    sc = replace(
        S, steps={**S.steps, "ready": replace(S.steps["ready"], next=Call("sphere", then=None))}
    )
    s = replace(new_session(sc, 1), step="ready")
    r = step(sc, s, Event("done", step="ready"))
    assert r.session.step == "sphere" and r.session.returns == ()


def test_file_stored():
    r = _run(*_to_ready())
    assert r.session.answers["docs"].file_id == "F1"


def test_answer_text():
    r = _run(*_to_extras(), _btn("extras", "logo"), _btn("extras", "other"), _text("бот"))
    assert answer_text(r.session.answers["extras"]) == "Логотип, Другое (бот)"
    assert answer_text(r.session.answers["privacy"]) == "Согласен"
    assert answer_text(_run(*_to_branch()).session.answers["name"]) == "Анна"
    assert answer_text(_run(*_to_ready()).session.answers["docs"]) == "файл"


def test_abandoned_branch_answer_dropped_on_back_to_branch():
    r = _run(
        *_to_hub(),
        _btn("hub", "cat"),
        _btn("cat", "a1"),
        Event("done", step="cat"),
        Event("back", step="hub"),
    )
    assert r.session.step == "branch"
    assert "cat" not in r.session.answers
    assert "hub" not in r.session.answers
    r = step(S, r.session, _btn("branch", "old"))
    assert "cat" not in r.session.answers


def test_back_from_second_category_keeps_first():
    r = _run(
        *_to_hub(),
        _btn("hub", "cat"),
        _btn("cat", "a1"),
        Event("done", step="cat"),
        _btn("hub", "catb"),
        _btn("cat_b", "b1"),
    )
    r = step(S, r.session, Event("back", step="cat_b"))
    assert r.session.step == "hub"
    assert r.session.answers["cat"].ids == ("a1",)
    assert "cat_b" not in r.session.answers


def test_back_to_step_before_hub_drops_category_and_hub_answers():
    r = _run(*_to_hub(), _btn("hub", "cat"), _btn("cat", "a1"), Event("done", step="cat"))
    r = step(S, r.session, Event("back", step="hub"))
    assert r.session.step == "branch"
    assert set(r.session.answers) == {"privacy", "name", "branch"}


def test_history_answers_parallel_to_history():
    r = _run(*_to_hub(), _btn("hub", "cat"), _btn("cat", "a1"), Event("done", step="cat"))
    assert len(r.session.history_answers) == len(r.session.history)


def test_session_roundtrips_json():
    r = _run(*_to_extras(), _btn("extras", "other"))
    json.dumps(dataclasses.asdict(r.session))

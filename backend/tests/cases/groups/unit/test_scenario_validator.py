from dataclasses import replace

import pytest

from src.scenario.entities import RETURN, Call, Option, Scenario, Step, StepType, When
from src.scenario.validator import validate_scenario

_KEYED = (StepType.TEXT, StepType.FILE, StepType.MULTI, StepType.MULTI_INPUT)


def _raw(steps: list[Step], entry: str = "a", blocks: dict | None = None) -> Scenario:
    return Scenario(version=1, entry=entry, blocks=blocks or {}, steps={s.id: s for s in steps})


def _keyed(step: Step) -> Step:
    return replace(step, key="Ответ") if step.type in _KEYED and step.key is None else step


def _scenario(steps: list[Step], entry: str = "a", blocks: dict | None = None) -> Scenario:
    """Шаги с подписью ответа: тесты ниже проверяют другие правила."""
    return _raw([_keyed(s) for s in steps], entry, blocks)


def _end(sid: str = "end") -> Step:
    return Step(id=sid, type=StepType.INFO, text="Спасибо", finish=True)


def _codes(s: Scenario) -> list[tuple[str, str, str | None]]:
    return [(i.code, i.step_id, i.option_id) for i in validate_scenario(s)]


def test_valid_scenario_has_no_issues():
    s = _scenario(
        [
            Step(
                id="a",
                type=StepType.CHOICE,
                text="?",
                options=(
                    Option(id="y", label="Да", next="b"),
                    Option(id="site", label="Сайт", url="https://example.com"),
                ),
            ),
            Step(id="b", type=StepType.TEXT, text="?", next=Call("blk", then="end")),
            _end(),
            Step(id="fin", type=StepType.INFO, text="Блок", finish=True),
        ],
        blocks={"blk": "fin"},
    )
    assert validate_scenario(s) == []


def test_return_target_inside_block_is_valid():
    s = _scenario(
        [
            Step(id="a", type=StepType.TEXT, text="?", next=Call("blk", then="end")),
            Step(id="inner", type=StepType.TEXT, text="?", next=RETURN),
            _end(),
        ],
        blocks={"blk": "inner"},
    )
    assert validate_scenario(s) == []


def test_bad_id_for_step_and_option():
    s = _scenario(
        [
            Step(
                id="A-1",
                type=StepType.CHOICE,
                text="?",
                options=(Option(id="Да", label="Да", next="end"),),
            ),
            _end(),
        ],
        entry="A-1",
    )
    assert _codes(s) == [("bad_id", "A-1", None), ("bad_id", "A-1", "Да")]


def test_bad_id_too_long():
    sid = "a" * 25
    s = _scenario([_end(sid)], entry=sid)
    assert _codes(s) == [("bad_id", sid, None)]


def test_missing_target_in_option_call_then_and_blocks():
    s = _scenario(
        [
            Step(
                id="a",
                type=StepType.CHOICE,
                text="?",
                options=(
                    Option(id="x", label="X", next="nope"),
                    Option(id="y", label="Y", next=Call("blk", then="gone")),
                ),
            ),
            _end("b"),
        ],
        blocks={"blk": "b", "bad": "ghost"},
    )
    assert _codes(s) == [
        ("missing_target", "a", "x"),
        ("missing_target", "a", "y"),
        ("missing_target", "bad", None),
    ]


def test_missing_target_on_step_next():
    s = _scenario([Step(id="a", type=StepType.TEXT, text="?", next="nope")])
    assert _codes(s) == [("missing_target", "a", None)]


def test_missing_target_when_entry_absent():
    s = _scenario([_end("a")], entry="ghost")
    assert ("missing_target", "ghost", None) in _codes(s)


def test_missing_next_on_option_uses_label():
    s = _scenario(
        [Step(id="a", type=StepType.CHOICE, text="?", options=(Option(id="y", label="Да"),))]
    )
    issues = validate_scenario(s)
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [("missing_next", "a", "y")]
    assert issues[0].message == 'Кнопка "Да" никуда не ведёт. Выберите следующий шаг.'


def test_empty_url_counts_as_missing_next():
    # Пустой адрес редактор оставляет, пока человек не ввёл ссылку: бот такую кнопку не покажет
    site = Option(id="y", label="Сайт", url="")
    s = _scenario([Step(id="a", type=StepType.CHOICE, text="?", options=(site,))])
    issues = validate_scenario(s)
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [("missing_next", "a", "y")]
    assert issues[0].message == 'Кнопка "Сайт" никуда не ведёт. Выберите следующий шаг.'


def test_missing_next_on_text_step():
    s = _scenario([Step(id="a", type=StepType.TEXT, text="?")])
    issues = validate_scenario(s)
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [("missing_next", "a", None)]
    assert issues[0].message == "После ответа бот не знает, куда идти. Выберите следующий шаг."


def test_missing_next_for_file_multi_and_multi_input():
    opt = (Option(id="o", label="О", next="end"),)
    s = _scenario(
        [
            Step(id="a", type=StepType.FILE, text="?", next="m"),
            Step(id="m", type=StepType.MULTI, text="?", options=opt),
            Step(id="mi", type=StepType.MULTI_INPUT, text="?", options=opt),
            Step(id="f", type=StepType.FILE, text="?"),
            _end(),
        ]
    )
    missing = [c for c in _codes(s) if c[0] == "missing_next"]
    assert missing == [
        ("missing_next", "m", None),
        ("missing_next", "mi", None),
        ("missing_next", "f", None),
    ]


def test_multi_next_of_options_is_not_used():
    s = _scenario(
        [
            Step(
                id="a",
                type=StepType.MULTI,
                text="?",
                options=(Option(id="o", label="О", next="end"),),
            ),
            _end(),
        ]
    )
    # переход мультивыбора задаёт только next шага, поэтому end недостижим
    assert _codes(s) == [("missing_next", "a", None), ("unreachable", "end", None)]


def test_finish_step_is_valid_end():
    assert validate_scenario(_scenario([_end("a")])) == []


def test_info_without_next_and_options_is_missing_next():
    s = _scenario([Step(id="a", type=StepType.INFO, text="Спасибо")])
    assert _codes(s) == [("missing_next", "a", None)]


def test_info_with_only_link_buttons_is_missing_next():
    site = Option(id="site", label="Сайт", url="https://example.com")
    s = _scenario([Step(id="a", type=StepType.INFO, text="?", options=(site,))])
    assert _codes(s) == [("missing_next", "a", None)]


def test_info_with_link_button_and_next_is_valid():
    site = Option(id="site", label="Сайт", url="https://example.com")
    s = _scenario([Step(id="a", type=StepType.INFO, text="?", options=(site,), next="end"), _end()])
    assert validate_scenario(s) == []


@pytest.mark.parametrize("kind", [StepType.TEXT, StepType.FILE])
def test_finish_on_text_and_file_is_bad_finish(kind):
    s = _scenario([Step(id="a", type=kind, text="?", finish=True, next="end"), _end()])
    issues = validate_scenario(s)
    assert [(i.code, i.step_id) for i in issues] == [("bad_finish", "a")]
    assert issues[0].message == "Завершать анкету может только шаг с сообщением или кнопками."


@pytest.mark.parametrize("kind", [StepType.INFO, StepType.CHOICE])
def test_finish_on_message_and_buttons_is_valid(kind):
    home = Option(id="home", label="В меню", next="a")
    s = _scenario([Step(id="a", type=kind, text="?", finish=True, options=(home,))])
    assert validate_scenario(s) == []


def test_unreachable_step_and_block_only_via_call():
    s = _scenario(
        [
            Step(id="a", type=StepType.TEXT, text="?", next="end"),
            _end(),
            _end("orphan"),
            _end("blkstep"),
        ],
        blocks={"blk": "blkstep"},
    )
    issues = validate_scenario(s)
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [
        ("unreachable", "orphan", None),
        ("unreachable", "blkstep", None),
    ]
    assert issues[0].message == "К этому шагу не ведёт ни одна кнопка."


def test_reachable_through_call_block_and_then():
    s = _scenario(
        [
            Step(id="a", type=StepType.TEXT, text="?", next=Call("blk", then="after")),
            Step(id="blkstep", type=StepType.TEXT, text="?", next=RETURN),
            _end("after"),
        ],
        blocks={"blk": "blkstep"},
    )
    assert validate_scenario(s) == []


def test_no_options():
    s = _scenario(
        [
            Step(id="a", type=StepType.CHOICE, text="?"),
            Step(id="b", type=StepType.MULTI, text="?", next="c"),
            Step(id="c", type=StepType.MULTI_INPUT, text="?", next="end"),
            _end(),
        ]
    )
    assert [c for c in _codes(s) if c[0] == "no_options"] == [
        ("no_options", "a", None),
        ("no_options", "b", None),
        ("no_options", "c", None),
    ]


def test_unknown_block():
    s = _scenario([Step(id="a", type=StepType.TEXT, text="?", next=Call("nope", then="a"))])
    assert _codes(s) == [("unknown_block", "a", None)]


def test_callback_within_limit_is_valid():
    sid, oid = "s" * 24, "o" * 24  # s:(24):o:(24) = 53 байта
    s = _scenario(
        [
            Step(
                id=sid,
                type=StepType.CHOICE,
                text="?",
                options=(Option(id=oid, label="X", next=sid),),
            )
        ],
        entry=sid,
    )
    assert validate_scenario(s) == []


def test_callback_too_long():
    sid, oid = "s" * 40, "o" * 30  # 2 + 40 + 3 + 30 = 75 байт
    s = _scenario(
        [
            Step(
                id=sid,
                type=StepType.CHOICE,
                text="?",
                options=(Option(id=oid, label="X", next=sid),),
            )
        ],
        entry=sid,
    )
    assert ("callback_too_long", sid, oid) in _codes(s)


def test_label_too_long():
    s = _scenario(
        [
            Step(
                id="a",
                type=StepType.CHOICE,
                text="?",
                options=(
                    Option(id="ok", label="я" * 40, next="a"),
                    Option(id="long", label="я" * 41, next="a"),
                ),
            )
        ]
    )
    assert _codes(s) == [("label_too_long", "a", "long")]


def test_when_unknown_step_on_step_and_option():
    s = _scenario(
        [
            Step(
                id="a",
                type=StepType.CHOICE,
                text="?",
                when=When(step="ghost", any=("x",)),
                next="a",
                options=(
                    Option(id="y", label="Y", next="a", when=When(step="ghost2", any=("x",))),
                ),
            )
        ]
    )
    assert _codes(s) == [("when_unknown_step", "a", None), ("when_unknown_step", "a", "y")]


def test_result_order_follows_step_order():
    s = _scenario(
        [
            Step(id="a", type=StepType.TEXT, text="?", next="c"),
            Step(id="b", type=StepType.TEXT, text="?"),
            Step(id="c", type=StepType.TEXT, text="?"),
        ]
    )
    assert [(code, sid) for code, sid, _ in _codes(s)] == [
        ("unreachable", "b"),
        ("missing_next", "b"),
        ("missing_next", "c"),
    ]


def test_missing_next_on_step_with_when():
    s = _scenario(
        [
            Step(
                id="a",
                type=StepType.CHOICE,
                text="?",
                options=(Option(id="y", label="Да", next="b"),),
            ),
            Step(
                id="b",
                type=StepType.CHOICE,
                text="?",
                when=When("a", ("y",)),
                options=(Option(id="z", label="Да", next="end"),),
            ),
            _end(),
        ]
    )
    assert _codes(s) == [("missing_next", "b", None)]


def test_when_step_with_next_is_valid():
    s = _scenario(
        [
            Step(
                id="a",
                type=StepType.TEXT,
                text="?",
                when=When("a", ("y",)),
                next="end",
            ),
            _end(),
        ]
    )
    assert validate_scenario(s) == []


# --- содержимое шага: то, что Telegram не примет ---


@pytest.mark.parametrize("text", ["", "   ", "\n\t"])
def test_empty_text(text):
    s = _scenario([replace(_end("a"), text=text)])
    issues = validate_scenario(s)
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [("empty_text", "a", None)]
    assert issues[0].message == "У шага нет текста."


def test_text_limit_counts_utf16_units():
    ok = "😀" * 2048  # 4096 единиц UTF-16, 2048 символов Python
    assert validate_scenario(_scenario([replace(_end("a"), text=ok)])) == []
    issues = validate_scenario(_scenario([replace(_end("a"), text=ok + "я")]))
    assert [i.code for i in issues] == ["text_too_long"]
    assert issues[0].message == "Текст длиннее 4096 знаков, Telegram его не отправит."


def test_empty_label():
    blank = Option(id="y", label="  ", next="end")
    s = _scenario([Step(id="a", type=StepType.CHOICE, text="?", options=(blank,)), _end()])
    issues = validate_scenario(s)
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [("empty_label", "a", "y")]
    assert issues[0].message == "У кнопки нет подписи."


@pytest.mark.parametrize(
    "url", ["example.com", "ftp://example.com", "https://exa mple.com", "tg://x", " https://a.b"]
)
def test_bad_url(url):
    site = Option(id="y", label="Сайт", url=url)
    s = _scenario([Step(id="a", type=StepType.CHOICE, text="?", options=(site,))])
    issues = validate_scenario(s)
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [("bad_url", "a", "y")]
    assert issues[0].message == "Адрес ссылки должен начинаться с http:// или https://."


@pytest.mark.parametrize("url", ["http://example.com", "https://example.com/a?b=1"])
def test_good_url(url):
    site = Option(id="y", label="Сайт", url=url)
    nav = Option(id="n", label="Дальше", next="end")
    s = _scenario([Step(id="a", type=StepType.CHOICE, text="?", options=(site, nav)), _end()])
    assert validate_scenario(s) == []


def _input_step(kind: StepType, prompt: str) -> Step:
    return Step(
        id="a",
        type=kind,
        text="?",
        options=(Option(id="o", label="Другое", input=prompt),),
        next="end",
    )


def test_empty_input_prompt():
    s = _scenario([_input_step(StepType.MULTI_INPUT, "  "), _end()])
    issues = validate_scenario(s)
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [("empty_text", "a", "o")]
    assert issues[0].message == "У шага нет текста."


def test_input_on_multi():
    s = _scenario([_input_step(StepType.MULTI, "Какой?"), _end()])
    issues = validate_scenario(s)
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [("input_on_multi", "a", "o")]
    assert issues[0].message == 'Свой текст доступен только у типа "Несколько + поле".'


def test_input_on_multi_input_is_valid():
    assert validate_scenario(_scenario([_input_step(StepType.MULTI_INPUT, "Какой?"), _end()])) == []


# --- подпись ответа ---


@pytest.mark.parametrize(
    "kind", [StepType.TEXT, StepType.FILE, StepType.MULTI, StepType.MULTI_INPUT]
)
@pytest.mark.parametrize("key", [None, "", "  "])
def test_missing_key(kind, key):
    options = (Option(id="o", label="О"),) if kind in (StepType.MULTI, StepType.MULTI_INPUT) else ()
    step = Step(id="a", type=kind, text="?", key=key, options=options, next="end")
    issues = validate_scenario(_raw([step, _end()]))
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [("missing_key", "a", None)]
    assert issues[0].message == "Укажите, как подписать ответ в заявке."


def test_choice_without_key_is_valid():
    nav = Option(id="y", label="Дальше", next="end")
    s = _raw([Step(id="a", type=StepType.CHOICE, text="?", options=(nav,)), _end()])
    assert validate_scenario(s) == []


# --- блоки и @return ---


def _call_scenario(target: Call, block: list[Step], extra: tuple[Step, ...] = ()) -> Scenario:
    return _scenario(
        [Step(id="a", type=StepType.TEXT, text="?", next=target), *block, *extra],
        blocks={"blk": block[0].id, "inner": "deep"} if len(block) > 1 else {"blk": block[0].id},
    )


def test_call_without_then_to_returning_block_is_missing_next():
    block = [Step(id="b", type=StepType.TEXT, text="?", next=RETURN)]
    issues = validate_scenario(_call_scenario(Call("blk"), block))
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [("missing_next", "a", None)]
    assert issues[0].message == "После блока бот не знает, куда идти. Выберите шаг возврата."


def test_call_without_then_on_option_is_reported_on_option():
    s = _scenario(
        [
            Step(
                id="a",
                type=StepType.CHOICE,
                text="?",
                options=(Option(id="y", label="Да", next=Call("blk")),),
            ),
            Step(id="b", type=StepType.TEXT, text="?", next=RETURN),
        ],
        blocks={"blk": "b"},
    )
    assert _codes(s) == [("missing_next", "a", "y")]


def test_call_without_then_to_final_block_is_valid():
    assert validate_scenario(_call_scenario(Call("blk"), [_end("b")])) == []


def test_call_without_then_inside_block_is_valid():
    # Вложенный блок вернётся туда же, куда внешний: шаг возврата у внешнего вызова есть.
    s = _call_scenario(
        Call("blk", then="end"),
        [
            Step(id="b", type=StepType.TEXT, text="?", next=Call("inner")),
            Step(id="deep", type=StepType.TEXT, text="?", next=RETURN),
        ],
        (_end(),),
    )
    assert validate_scenario(s) == []


def test_return_reachable_through_nested_call_without_then():
    s = _call_scenario(
        Call("blk"),
        [
            Step(id="b", type=StepType.TEXT, text="?", next=Call("inner")),
            Step(id="deep", type=StepType.TEXT, text="?", next=RETURN),
        ],
    )
    assert _codes(s) == [("missing_next", "a", None)]


def test_return_of_nested_call_with_then_does_not_leave_block():
    s = _call_scenario(
        Call("blk"),
        [
            Step(id="b", type=StepType.TEXT, text="?", next=Call("inner", then="end")),
            Step(id="deep", type=StepType.TEXT, text="?", next=RETURN),
        ],
        (_end(),),
    )
    assert validate_scenario(s) == []


def test_return_outside_block_is_missing_next():
    s = _scenario([Step(id="a", type=StepType.TEXT, text="?", next=RETURN)])
    issues = validate_scenario(s)
    assert [(i.code, i.step_id, i.option_id) for i in issues] == [("missing_next", "a", None)]
    assert issues[0].message == "После ответа бот не знает, куда идти. Выберите следующий шаг."


def test_return_after_final_button_is_missing_next():
    # Кнопка под финалом начинает проход с пустым стеком, даже если финал стоит внутри блока.
    fin = Step(
        id="fin",
        type=StepType.INFO,
        text="Спасибо",
        finish=True,
        options=(Option(id="again", label="Ещё", next="after"),),
    )
    s = _scenario(
        [
            Step(id="a", type=StepType.TEXT, text="?", next=Call("blk", then="fin")),
            Step(id="b", type=StepType.TEXT, text="?", next=RETURN),
            fin,
            Step(id="after", type=StepType.TEXT, text="?", next=RETURN),
        ],
        blocks={"blk": "b"},
    )
    assert _codes(s) == [("missing_next", "after", None)]

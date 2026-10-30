from src.scenario.entities import RETURN, Call, Option, Scenario, Step, StepType, When
from src.scenario.validator import validate_scenario


def _scenario(steps: list[Step], entry: str = "a", blocks: dict | None = None) -> Scenario:
    return Scenario(version=1, entry=entry, blocks=blocks or {}, steps={s.id: s for s in steps})


def _end(sid: str = "end") -> Step:
    return Step(id=sid, type=StepType.INFO, text="Спасибо")


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
            Step(id="fin", type=StepType.INFO, text="Блок"),
        ],
        blocks={"blk": "fin"},
    )
    assert validate_scenario(s) == []


def test_return_target_is_valid():
    s = _scenario([Step(id="a", type=StepType.TEXT, text="?", next=RETURN)])
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
    s = _scenario([Step(id=sid, type=StepType.INFO, text="?")], entry=sid)
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
            Step(id="b", type=StepType.INFO, text="?"),
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


def test_info_without_next_and_options_is_valid_end():
    assert validate_scenario(_scenario([_end("a")])) == []


def test_unreachable_step_and_block_only_via_call():
    s = _scenario(
        [
            Step(id="a", type=StepType.TEXT, text="?", next="end"),
            _end(),
            Step(id="orphan", type=StepType.INFO, text="?"),
            Step(id="blkstep", type=StepType.INFO, text="?"),
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
            Step(id="blkstep", type=StepType.INFO, text="?"),
            Step(id="after", type=StepType.INFO, text="?"),
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

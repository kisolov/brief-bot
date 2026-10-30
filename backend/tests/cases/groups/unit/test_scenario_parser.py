import pytest

from src.scenario.entities import RETURN, Call, When
from src.scenario.exceptions import ScenarioMalformed
from src.scenario.parser import dump_scenario, parse_scenario

DATA = {
    "entry": "payment",
    "blocks": {"final": "fin_name"},
    "steps": {
        "payment": {
            "type": "choice",
            "text": "Нужно ли подключать оплату на сайте?\nТолько для ИП и юрлиц",
            "key": "Оплата на сайте",
            "options": [
                {"id": "y", "label": "Да", "next": "delivery"},
                {"id": "n", "label": "Нет", "next": "delivery"},
            ],
        },
        "delivery": {
            "type": "multi_input",
            "text": "Что нужно?",
            "no_back": True,
            "done_label": "Дальше",
            "pos": [10, 20.5],
            "when": {"step": "payment", "any": ["y"]},
            "options": [
                {
                    "id": "a",
                    "label": "Другое",
                    "input": "Опишите",
                    "exclusive": True,
                    "when": {"step": "payment", "any": ["y", "n"]},
                    "url": "https://example.com",
                    "next": {"call": "final", "then": "phone"},
                },
            ],
            "next": RETURN,
        },
        "phone": {"type": "text", "text": "Телефон?", "validate": "phone", "next": "end"},
        "end": {"type": "info", "text": "Спасибо"},
    },
}


def test_parse_choice_step():
    s = parse_scenario(DATA, 3)

    assert s.version == 3
    assert s.entry == "payment"
    assert s.blocks == {"final": "fin_name"}
    step = s.steps["payment"]
    assert step.id == "payment"
    assert step.key == "Оплата на сайте"
    assert step.options[0].next == "delivery"
    assert step.options[1].label == "Нет"


def test_parse_call_target():
    s = parse_scenario(DATA, 1)

    opt = s.steps["delivery"].options[0]
    assert opt.next == Call("final", "phone")
    assert opt.when == When("payment", ("y", "n"))
    assert s.steps["delivery"].next == RETURN
    assert s.steps["delivery"].pos == (10, 20.5)


def test_roundtrip():
    s = parse_scenario(DATA, 1)

    assert parse_scenario(dump_scenario(s), s.version) == s


def test_dump_omits_defaults():
    dumped = dump_scenario(parse_scenario(DATA, 1))

    assert dumped["steps"]["end"] == {"type": "info", "text": "Спасибо"}
    assert dumped["steps"]["payment"]["options"][0] == {
        "id": "y",
        "label": "Да",
        "next": "delivery",
    }
    assert dumped["steps"]["delivery"]["pos"] == [10, 20.5]


def test_unknown_type_rejected():
    data = {"entry": "a", "blocks": {}, "steps": {"a": {"type": "bogus", "text": "x"}}}

    with pytest.raises(ScenarioMalformed):
        parse_scenario(data, 1)


@pytest.mark.parametrize(
    "data",
    [
        {"blocks": {}, "steps": {}},
        {"entry": "a", "blocks": {}},
        {"entry": "a", "blocks": {}, "steps": {"a": {"text": "x"}}},
        {"entry": "a", "blocks": {}, "steps": {"a": {"type": "info"}}},
        {
            "entry": "a",
            "blocks": {},
            "steps": {"a": {"type": "choice", "text": "x", "options": [{"id": "y"}]}},
        },
        {
            "entry": "a",
            "blocks": {},
            "steps": {"a": {"type": "info", "text": "x", "next": {"then": "b"}}},
        },
        {
            "entry": "a",
            "blocks": {},
            "steps": {"a": {"type": "info", "text": "x", "when": {"step": "b"}}},
        },
        {"entry": "a", "blocks": {}, "steps": {"a": {"type": "info", "text": "x", "pos": [1]}}},
        {
            "entry": "a",
            "blocks": {},
            "steps": {"a": {"type": "text", "text": "x", "validate": "email"}},
        },
    ],
)
def test_malformed_rejected(data):
    with pytest.raises(ScenarioMalformed):
        parse_scenario(data, 1)

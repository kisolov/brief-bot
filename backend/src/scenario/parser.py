"""Разбор JSON сценария в сущности и обратная сборка."""

from typing import Any

from src.scenario.entities import Call, Option, Scenario, Step, StepType, Target, When
from src.scenario.exceptions import ScenarioMalformed

_VALIDATORS = ("phone", "url")


def parse_scenario(data: dict, version: int) -> Scenario:
    if not isinstance(data, dict):
        raise ScenarioMalformed("сценарий должен быть объектом")
    entry = _require(data, "entry", str, "сценарий")
    blocks = data.get("blocks", {})
    if not isinstance(blocks, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in blocks.items()
    ):
        raise ScenarioMalformed("blocks должен быть объектом строк")
    raw_steps = _require(data, "steps", dict, "сценарий")
    steps = {sid: _parse_step(sid, raw) for sid, raw in raw_steps.items()}
    return Scenario(version=version, entry=entry, blocks=dict(blocks), steps=steps)


def dump_scenario(s: Scenario) -> dict:
    return {
        "entry": s.entry,
        "blocks": dict(s.blocks),
        "steps": {sid: _dump_step(step) for sid, step in s.steps.items()},
    }


def _require(raw: Any, field: str, kind: type, where: str) -> Any:
    if not isinstance(raw, dict) or field not in raw:
        raise ScenarioMalformed(f"{where}: нет поля {field}")
    value = raw[field]
    if not isinstance(value, kind):
        raise ScenarioMalformed(f"{where}: поле {field} неверного типа")
    return value


def _optional(raw: dict, field: str, kind: type, where: str) -> Any:
    value = raw.get(field)
    if value is not None and not isinstance(value, kind):
        raise ScenarioMalformed(f"{where}: поле {field} неверного типа")
    return value


def _parse_step(sid: str, raw: Any) -> Step:
    where = f"шаг {sid}"
    raw_type = _require(raw, "type", str, where)
    try:
        step_type = StepType(raw_type)
    except ValueError:
        raise ScenarioMalformed(f"{where}: неизвестный тип {raw_type}") from None
    text = _require(raw, "text", str, where)
    validate = _optional(raw, "validate", str, where)
    if validate is not None and validate not in _VALIDATORS:
        raise ScenarioMalformed(f"{where}: неизвестная проверка {validate}")
    raw_options = raw.get("options", [])
    if not isinstance(raw_options, list):
        raise ScenarioMalformed(f"{where}: options должен быть списком")
    return Step(
        id=sid,
        type=step_type,
        text=text,
        key=_optional(raw, "key", str, where),
        options=tuple(_parse_option(sid, o) for o in raw_options),
        next=_parse_target(raw.get("next"), where),
        when=_parse_when(raw.get("when"), where),
        no_back=bool(_optional(raw, "no_back", bool, where)),
        validate=validate,
        done_label=_optional(raw, "done_label", str, where),
        pos=_parse_pos(raw.get("pos"), where),
    )


def _parse_option(sid: str, raw: Any) -> Option:
    where = f"шаг {sid}, опция"
    return Option(
        id=_require(raw, "id", str, where),
        label=_require(raw, "label", str, where),
        next=_parse_target(raw.get("next"), where),
        input=_optional(raw, "input", str, where),
        exclusive=bool(_optional(raw, "exclusive", bool, where)),
        when=_parse_when(raw.get("when"), where),
        url=_optional(raw, "url", str, where),
    )


def _parse_target(raw: Any, where: str) -> Target | None:
    if raw is None or isinstance(raw, str):
        return raw
    block = _require(raw, "call", str, f"{where}, переход")
    then = _optional(raw, "then", str, f"{where}, переход")
    return Call(block, then)


def _parse_when(raw: Any, where: str) -> When | None:
    if raw is None:
        return None
    step = _require(raw, "step", str, f"{where}, условие")
    values = _require(raw, "any", list, f"{where}, условие")
    if not all(isinstance(v, str) for v in values):
        raise ScenarioMalformed(f"{where}: условие any должно быть списком строк")
    return When(step, tuple(values))


def _parse_pos(raw: Any, where: str) -> tuple[float, float] | None:
    if raw is None:
        return None
    ok = isinstance(raw, list) and len(raw) == 2
    if not ok or not all(isinstance(v, int | float) and not isinstance(v, bool) for v in raw):
        raise ScenarioMalformed(f"{where}: pos должен быть списком из двух чисел")
    return (raw[0], raw[1])


def _dump_step(step: Step) -> dict:
    out: dict[str, Any] = {"type": step.type.value, "text": step.text}
    if step.key is not None:
        out["key"] = step.key
    if step.options:
        out["options"] = [_dump_option(o) for o in step.options]
    if step.next is not None:
        out["next"] = _dump_target(step.next)
    if step.when is not None:
        out["when"] = _dump_when(step.when)
    if step.no_back:
        out["no_back"] = True
    if step.validate is not None:
        out["validate"] = step.validate
    if step.done_label is not None:
        out["done_label"] = step.done_label
    if step.pos is not None:
        out["pos"] = list(step.pos)
    return out


def _dump_option(opt: Option) -> dict:
    out: dict[str, Any] = {"id": opt.id, "label": opt.label}
    if opt.next is not None:
        out["next"] = _dump_target(opt.next)
    if opt.input is not None:
        out["input"] = opt.input
    if opt.exclusive:
        out["exclusive"] = True
    if opt.when is not None:
        out["when"] = _dump_when(opt.when)
    if opt.url is not None:
        out["url"] = opt.url
    return out


def _dump_target(target: Target) -> str | dict:
    if isinstance(target, Call):
        out = {"call": target.block}
        if target.then is not None:
            out["then"] = target.then
        return out
    return target


def _dump_when(when: When) -> dict:
    return {"step": when.step, "any": list(when.any)}

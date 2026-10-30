"""Начальный сценарий из ТЗ заказчика."""

import json
from importlib import resources

from src.scenario.entities import Scenario
from src.scenario.parser import parse_scenario

SEED_VERSION = 1


def load_seed() -> Scenario:
    raw = resources.files(__package__).joinpath("scenario.json").read_text(encoding="utf-8")
    return parse_scenario(json.loads(raw), version=SEED_VERSION)

"""Ошибки домена сценария."""

from src.scenario.validator import Issue
from src.shared.exceptions import DomainException


class ScenarioMalformed(DomainException):
    """JSON сценария нельзя разобрать: нет обязательных полей или неверная форма."""


class DraftConflict(DomainException):
    """Черновик успели изменить: base_revision устарел."""


class ScenarioInvalid(DomainException):
    """Сценарий не прошёл проверку и не опубликован."""

    def __init__(self, issues: list[Issue]) -> None:
        super().__init__(f"найдено проблем: {len(issues)}")
        self.issues = issues

"""Ошибки домена сценария."""

from src.shared.exceptions import DomainException


class ScenarioMalformed(DomainException):
    """JSON сценария нельзя разобрать: нет обязательных полей или неверная форма."""

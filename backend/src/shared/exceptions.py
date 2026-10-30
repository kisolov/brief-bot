"""Доменные исключения, общие для всех модулей."""


class DomainException(Exception):
    """Базовая ошибка предметной области."""


class NotFound(DomainException):
    """Запрошенная сущность не найдена."""


class UniqueViolation(DomainException):
    """Нарушена уникальность сущности."""

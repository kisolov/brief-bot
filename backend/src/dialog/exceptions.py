"""Исключения диалога."""

from src.shared.exceptions import DomainException


class SessionNotFound(DomainException):
    """Для чата нет сессии."""

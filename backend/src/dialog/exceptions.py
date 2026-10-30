"""Исключения диалога."""

from src.shared.exceptions import DomainException


class SessionNotFound(DomainException):
    """Для чата нет сессии."""


class ChatBlocked(DomainException):
    """Пользователь заблокировал бота или чата больше нет."""

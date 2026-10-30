"""Ошибки домена доступа."""

from src.shared.exceptions import DomainException


class NotAdmin(DomainException):
    """Аккаунт не администратор и не предъявил верный код приглашения."""


class InvalidEditorToken(DomainException):
    """Токен неизвестен, просрочен, уже использован или другого вида."""

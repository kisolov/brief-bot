"""Ошибки домена заявок."""

from src.shared.exceptions import DomainException


class FileTooLarge(DomainException):
    """Файл больше лимита Telegram на скачивание ботом."""

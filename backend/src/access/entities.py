"""Сущности доступа: виды токенов редактора."""

from enum import StrEnum


class TokenKind(StrEnum):
    # Одноразовая ссылка из бота.
    LINK = "link"
    # Сессия редактора, живёт в cookie.
    SESSION = "session"

"""Фабрика логгеров. Сообщение постоянное, переменные данные идут скалярами в extra."""

import logging


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)

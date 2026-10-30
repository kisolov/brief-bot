"""Текст заявки для менеджера: простой текст, без разметки Telegram."""

from src.leads.entities import Lead, LeadStatus

# Лимит Telegram на длину одного сообщения.
MAX_PART = 4096

# Ключ шага в сценарии не всегда пригоден для показа: одно место для подписей (R9).
_DISPLAY_KEYS = {"name": "Имя"}


def display_key(key: str) -> str:
    return _DISPLAY_KEYS.get(key, key)


def format_lead(lead: Lead) -> list[str]:
    partial = lead.status is LeadStatus.PARTIAL
    lines = ["Частичная заявка" if partial else "Новая заявка"]
    if lead.branch:
        lines.append(f"Направление: {lead.branch}")
    if lead.username:
        lines.append(f"Telegram: @{lead.username}")
    if partial and lead.last_step:
        lines.append(f"Последний шаг: {lead.last_step}")
    lines.extend(f"{display_key(a.key)}: {a.value}" for a in lead.answers)
    return _split("\n".join(lines))


def _units(text: str) -> int:
    """Длина в единицах UTF-16: так Telegram считает лимит сообщения."""
    return len(text.encode("utf-16-le")) // 2


def _cut(line: str) -> list[str]:
    """Жёсткая резка по лимиту в UTF-16, суррогатная пара не разрывается."""
    pieces: list[str] = []
    start = 0
    used = 0
    for i, char in enumerate(line):
        width = 2 if ord(char) > 0xFFFF else 1
        if used + width > MAX_PART:
            pieces.append(line[start:i])
            start, used = i, 0
        used += width
    pieces.append(line[start:])
    return pieces


def _split(text: str) -> list[str]:
    """Режет по границам строк; строку длиннее лимита режет жёстко.

    Пустые и состоящие из пробелов части отбрасываются: Telegram их отклоняет.
    """
    parts: list[str] = []
    # None: ничего не накоплено. "" это накопленная пустая строка, её нельзя терять на стыке.
    current: str | None = None

    def flush() -> None:
        if current is not None and current.strip():
            parts.append(current)

    for line in text.split("\n"):
        for piece in _cut(line):
            if current is None:
                current = piece
            elif _units(current) + 1 + _units(piece) <= MAX_PART:
                current += "\n" + piece
            else:
                flush()
                current = piece
    flush()
    return parts

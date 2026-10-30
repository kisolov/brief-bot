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


def _split(text: str) -> list[str]:
    """Режет по границам строк; строку длиннее лимита режет жёстко."""
    parts: list[str] = []
    current = ""
    for line in text.split("\n"):
        pieces = [line[i : i + MAX_PART] for i in range(0, len(line), MAX_PART)] or [""]
        for piece in pieces:
            if current and len(current) + 1 + len(piece) <= MAX_PART:
                current += "\n" + piece
            else:
                if current:
                    parts.append(current)
                current = piece
    parts.append(current)
    return parts

"""DTO заявок для HTTP API. chat_id наружу не отдаётся."""

from datetime import datetime

from src.leads.entities import Lead, LeadStatus
from src.leads.formatter import display_key
from src.shared.base_camel_model import CamelModel


class LeadAnswerDto(CamelModel):
    key: str
    value: str


class LeadDto(CamelModel):
    id: int
    branch: str
    username: str | None
    status: LeadStatus
    created_at: datetime
    last_step: str | None
    has_file: bool
    answers: list[LeadAnswerDto]

    @classmethod
    def from_domain(cls, lead: Lead) -> "LeadDto":
        assert lead.id is not None
        return cls(
            id=lead.id,
            branch=lead.branch,
            username=lead.username,
            status=lead.status,
            created_at=lead.created_at,
            last_step=lead.last_step,
            has_file=lead.file_id is not None,
            answers=[LeadAnswerDto(key=display_key(a.key), value=a.value) for a in lead.answers],
        )

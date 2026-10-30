"""DTO сценария для HTTP API. Данные черновика идут как есть: он может быть невалидным."""

from datetime import datetime
from typing import Any

from src.scenario.entities import Draft, VersionInfo
from src.scenario.validator import Issue
from src.shared.base_camel_model import CamelModel


class DraftDto(CamelModel):
    data: dict[str, Any]
    revision: int

    @classmethod
    def from_domain(cls, draft: Draft) -> "DraftDto":
        return cls(data=draft.data, revision=draft.revision)


class SaveDraftDto(CamelModel):
    data: dict[str, Any]
    revision: int


class RevisionDto(CamelModel):
    revision: int


class PublishedDto(CamelModel):
    version: int


class VersionDto(CamelModel):
    number: int
    published_at: datetime
    active: bool

    @classmethod
    def from_domain(cls, info: VersionInfo) -> "VersionDto":
        return cls(number=info.number, published_at=info.published_at, active=info.active)


class IssueDto(CamelModel):
    code: str
    step_id: str
    option_id: str | None
    message: str

    @classmethod
    def from_domain(cls, issue: Issue) -> "IssueDto":
        return cls(
            code=issue.code,
            step_id=issue.step_id,
            option_id=issue.option_id,
            message=issue.message,
        )

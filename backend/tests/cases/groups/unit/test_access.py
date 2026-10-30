from datetime import UTC, datetime, timedelta

import pytest
from pydantic import SecretStr

from src.access.adapters.memory import InMemoryAdminRepository, InMemoryTokenRepository
from src.access.exceptions import InvalidEditorToken, NotAdmin
from src.access.services import AccessService
from src.access.usecases.check_editor_session import CheckEditorSession
from src.access.usecases.exchange_token import ExchangeToken
from src.access.usecases.issue_editor_link import IssueEditorLink
from src.bootstrap.settings import EditorSettings

ADMIN = 100
STRANGER = 200
INVITE = "secret-code"
NOW = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> datetime:
        return self.now


class Stand:
    def __init__(self) -> None:
        self.clock = Clock()
        self.admins = InMemoryAdminRepository()
        self.tokens = InMemoryTokenRepository()
        self.access = AccessService(self.admins, self.tokens)
        self.issue = IssueEditorLink(
            self.access,
            EditorSettings(base_url="https://editor.example.com/").base_url,
            SecretStr(INVITE),
            self.clock,
        )
        self.exchange = ExchangeToken(self.access, self.clock)
        self.check = CheckEditorSession(self.access, self.clock)


@pytest.fixture
async def stand() -> Stand:
    s = Stand()
    await s.access.add_admin(ADMIN)
    return s


def _token(link: str) -> str:
    prefix = "https://editor.example.com/login?token="
    assert link.startswith(prefix)
    return link.removeprefix(prefix)


async def test_editor_link_for_admin(stand):
    link = await stand.issue(ADMIN, None)

    assert _token(link)


async def test_non_admin_refused(stand):
    with pytest.raises(NotAdmin):
        await stand.issue(STRANGER, None)


async def test_invite_code_adds_admin(stand):
    link = await stand.issue(STRANGER, INVITE)

    assert _token(link)
    assert await stand.access.is_admin(STRANGER)
    assert _token(await stand.issue(STRANGER, None))


async def test_wrong_invite_refused(stand):
    with pytest.raises(NotAdmin):
        await stand.issue(STRANGER, "wrong")

    assert not await stand.access.is_admin(STRANGER)


async def test_non_ascii_wrong_invite_refused(stand):
    with pytest.raises(NotAdmin):
        await stand.issue(STRANGER, "код-приглашения")


async def test_token_is_one_time(stand):
    token = _token(await stand.issue(ADMIN, None))

    session = await stand.exchange(token)

    assert session
    with pytest.raises(InvalidEditorToken):
        await stand.exchange(token)


async def test_token_expires_after_10_minutes(stand):
    fresh = _token(await stand.issue(ADMIN, None))
    late = _token(await stand.issue(ADMIN, None))

    stand.clock.now = NOW + timedelta(minutes=10) - timedelta(seconds=1)
    assert await stand.exchange(fresh)
    stand.clock.now = NOW + timedelta(minutes=10)
    with pytest.raises(InvalidEditorToken):
        await stand.exchange(late)


async def test_unknown_token_refused(stand):
    with pytest.raises(InvalidEditorToken):
        await stand.exchange("never-issued")


async def test_session_valid_for_24_hours(stand):
    session = await stand.exchange(_token(await stand.issue(ADMIN, None)))

    stand.clock.now = NOW + timedelta(hours=24) - timedelta(seconds=1)
    await stand.check(session)
    stand.clock.now = NOW + timedelta(hours=24)
    with pytest.raises(InvalidEditorToken):
        await stand.check(session)


async def test_link_token_is_not_a_session(stand):
    token = _token(await stand.issue(ADMIN, None))

    with pytest.raises(InvalidEditorToken):
        await stand.check(token)


async def test_garbage_session_refused(stand):
    with pytest.raises(InvalidEditorToken):
        await stand.check("garbage")


async def test_only_hashes_are_stored(stand):
    token = _token(await stand.issue(ADMIN, None))
    session = await stand.exchange(token)

    assert token not in stand.tokens.hashes
    assert session not in stand.tokens.hashes

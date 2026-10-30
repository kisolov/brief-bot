"""HTTP API редактора целиком: ASGI без сети, адаптеры в памяти, без docker."""

from dataclasses import replace
from datetime import UTC, datetime

import httpx
import pytest
from dependency_injector import providers
from pydantic import SecretStr

from src.bootstrap.app import create_app
from src.bootstrap.di import Container
from src.bootstrap.settings import EditorSettings, TelegramSettings
from src.leads.entities import Lead, LeadAnswer, LeadStatus
from src.leads.exceptions import FileTooLarge

ADMIN = 100
LINK_PREFIX = "https://editor.example.com/login?token="


@pytest.fixture
async def container() -> Container:
    c = Container()
    c.scenario_repository.override(c.memory_scenario_repository)
    c.session_repository.override(c.memory_session_repository)
    c.reminder_queue.override(c.memory_reminder_queue)
    c.settings_repository.override(c.memory_settings_repository)
    c.lead_repository.override(c.memory_lead_repository)
    c.manager_notifier.override(c.mock_manager_notifier)
    c.admin_repository.override(c.memory_admin_repository)
    c.token_repository.override(c.memory_token_repository)
    c.file_gateway.override(c.mock_file_gateway)
    c.editor_settings.override(
        providers.Object(EditorSettings(base_url="https://editor.example.com"))
    )
    c.telegram_settings.override(
        providers.Object(
            TelegramSettings(
                token=SecretStr("1:x"), manager_chat_id=1, invite_code=SecretStr("code")
            )
        )
    )
    await c.scenario_service().ensure_seeded()
    await c.access_service().add_admin(ADMIN)
    return c


@pytest.fixture
async def anon(container) -> httpx.AsyncClient:
    app = create_app(container)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="https://test") as client:
        yield client


@pytest.fixture
async def api(container, anon) -> httpx.AsyncClient:
    link = await container.issue_editor_link()(ADMIN, None)
    token = link.removeprefix(LINK_PREFIX)
    response = await anon.post("/api/auth/exchange", json={"token": token})
    assert response.status_code == 204
    return anon


async def _lead(container, **kwargs) -> Lead:
    lead = Lead(
        id=None,
        chat_id=555,
        username="anna",
        branch="Новый сайт",
        answers=(LeadAnswer("name", "Анна"), LeadAnswer("Бюджет", "100")),
        status=LeadStatus.FULL,
        file_id=None,
        created_at=datetime(2026, 10, 30, tzinfo=UTC),
        last_step="fin",
    )
    return await container.lead_repository().upsert_open(replace(lead, **kwargs))


PROTECTED = [
    ("GET", "/api/scenario/draft"),
    ("PUT", "/api/scenario/draft"),
    ("POST", "/api/scenario/publish"),
    ("GET", "/api/scenario/versions"),
    ("POST", "/api/scenario/versions/1/activate"),
    ("GET", "/api/leads"),
    ("GET", "/api/leads/1"),
    ("GET", "/api/leads/1/file"),
    ("GET", "/api/settings/reminder"),
    ("PUT", "/api/settings/reminder"),
]


@pytest.mark.parametrize(("method", "path"), PROTECTED)
async def test_api_requires_cookie(anon, method, path):
    response = await anon.request(method, path, json={})

    assert response.status_code == 401


async def test_forged_cookie_is_refused(anon):
    anon.cookies.set("editor_session", "forged", domain="test")

    response = await anon.get("/api/scenario/draft")

    assert response.status_code == 401


async def test_exchange_sets_session_cookie(container, anon):
    token = (await container.issue_editor_link()(ADMIN, None)).removeprefix(LINK_PREFIX)

    response = await anon.post("/api/auth/exchange", json={"token": token})

    cookie = response.headers["set-cookie"].lower()
    assert response.status_code == 204
    assert "editor_session=" in cookie
    for attr in ("httponly", "secure", "samesite=lax", "path=/", "max-age=86400"):
        assert attr in cookie
    assert (await anon.get("/api/scenario/draft")).status_code == 200


async def test_exchange_rejects_used_and_unknown_token(container, anon):
    token = (await container.issue_editor_link()(ADMIN, None)).removeprefix(LINK_PREFIX)
    await anon.post("/api/auth/exchange", json={"token": token})
    anon.cookies.clear()

    again = await anon.post("/api/auth/exchange", json={"token": token})
    unknown = await anon.post("/api/auth/exchange", json={"token": "nope"})

    assert again.status_code == 401
    assert unknown.status_code == 401
    assert "set-cookie" not in unknown.headers


async def test_draft_roundtrip(api):
    got = (await api.get("/api/scenario/draft")).json()
    data = got["data"]
    data["steps"]["privacy"]["text"] = "Новый текст"

    saved = await api.put("/api/scenario/draft", json={"data": data, "revision": got["revision"]})

    assert saved.status_code == 200
    assert saved.json() == {"revision": got["revision"] + 1}
    again = (await api.get("/api/scenario/draft")).json()
    assert again["data"]["steps"]["privacy"]["text"] == "Новый текст"


async def test_stale_draft_returns_409(api):
    got = (await api.get("/api/scenario/draft")).json()
    body = {"data": got["data"], "revision": got["revision"]}
    first = await api.put("/api/scenario/draft", json=body)

    stale = await api.put("/api/scenario/draft", json=body)

    assert first.status_code == 200
    assert stale.status_code == 409


async def test_publish_valid_creates_version(api):
    response = await api.post("/api/scenario/publish")

    assert response.status_code == 200
    assert response.json() == {"version": 2}
    versions = (await api.get("/api/scenario/versions")).json()
    assert [(v["number"], v["active"]) for v in versions] == [(1, False), (2, True)]
    assert "publishedAt" in versions[0]


async def test_publish_invalid_returns_issues(api):
    got = (await api.get("/api/scenario/draft")).json()
    data = got["data"]
    data["steps"]["privacy"]["options"][1]["next"] = "ghost"
    await api.put("/api/scenario/draft", json={"data": data, "revision": got["revision"]})
    before = (await api.get("/api/scenario/versions")).json()

    response = await api.post("/api/scenario/publish")

    assert response.status_code == 422
    issues = response.json()["issues"]
    assert all(set(i) == {"code", "stepId", "optionId", "message"} for i in issues)
    missing = next(i for i in issues if i["code"] == "missing_target")
    assert missing["stepId"] == "privacy"
    assert missing["optionId"] == "start"
    assert (await api.get("/api/scenario/versions")).json() == before


async def test_activate_version_rolls_back(api):
    await api.post("/api/scenario/publish")

    response = await api.post("/api/scenario/versions/1/activate")

    assert response.status_code == 204
    versions = (await api.get("/api/scenario/versions")).json()
    assert [(v["number"], v["active"]) for v in versions] == [(1, True), (2, False)]


async def test_activate_unknown_version_returns_404(api):
    assert (await api.post("/api/scenario/versions/99/activate")).status_code == 404


async def test_leads_list_and_filter(api, container):
    await _lead(container, chat_id=1, status=LeadStatus.PARTIAL)
    await _lead(container, chat_id=2, status=LeadStatus.FULL, file_id="f1")

    everything = (await api.get("/api/leads")).json()
    partial = (await api.get("/api/leads", params={"status": "partial"})).json()
    full = (await api.get("/api/leads", params={"status": "full"})).json()
    bad = await api.get("/api/leads", params={"status": "weird"})

    assert len(everything) == 2
    assert [x["status"] for x in partial] == ["partial"]
    assert [x["hasFile"] for x in full] == [True]
    assert bad.status_code == 422


async def test_lead_card_hides_chat_id_and_shows_labels(api, container):
    saved = await _lead(container)

    card = (await api.get(f"/api/leads/{saved.id}")).json()

    assert "chatId" not in card and "chat_id" not in card
    assert card["id"] == saved.id
    assert card["branch"] == "Новый сайт"
    assert card["username"] == "anna"
    assert card["lastStep"] == "fin"
    assert card["hasFile"] is False
    assert "createdAt" in card
    assert card["answers"] == [
        {"key": "Имя", "value": "Анна"},
        {"key": "Бюджет", "value": "100"},
    ]


async def test_unknown_lead_returns_404(api):
    assert (await api.get("/api/leads/999")).status_code == 404


async def test_lead_file_download(api, container):
    saved = await _lead(container, file_id="doc1")
    container.mock_file_gateway().files["doc1"] = b"PDFDATA"

    response = await api.get(f"/api/leads/{saved.id}/file")

    assert response.status_code == 200
    assert response.content == b"PDFDATA"
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.headers["content-disposition"] == f'attachment; filename="tz-{saved.id}"'


async def test_lead_without_file_returns_404(api, container):
    saved = await _lead(container)

    assert (await api.get(f"/api/leads/{saved.id}/file")).status_code == 404


async def test_file_too_large_returns_413(api, container):
    saved = await _lead(container, file_id="big")
    container.mock_file_gateway().errors["big"] = FileTooLarge("файл больше 20 МБ")

    assert (await api.get(f"/api/leads/{saved.id}/file")).status_code == 413


async def test_reminder_settings_roundtrip(api):
    default = (await api.get("/api/settings/reminder")).json()
    assert set(default) == {"hours", "text"}

    saved = await api.put("/api/settings/reminder", json={"hours": 5, "text": "Вы тут?"})

    assert saved.status_code == 200
    assert saved.json() == {"hours": 5, "text": "Вы тут?"}
    assert (await api.get("/api/settings/reminder")).json() == {"hours": 5, "text": "Вы тут?"}


@pytest.mark.parametrize(
    "body",
    [
        {"hours": 0, "text": "x"},
        {"hours": 169, "text": "x"},
        {"hours": 1, "text": ""},
        {"hours": 1, "text": "я" * 1025},
        {"hours": "abc", "text": "x"},
    ],
)
async def test_reminder_settings_validation(api, body):
    assert (await api.put("/api/settings/reminder", json=body)).status_code == 422


async def test_no_endpoint_exposes_manager_chat(container):
    app = create_app(container)

    schema = str(app.openapi()).lower()

    assert "manager" not in schema
    assert app.openapi_url is None and app.docs_url is None and app.redoc_url is None

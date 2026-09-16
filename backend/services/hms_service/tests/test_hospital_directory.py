import json
from uuid import uuid4

import httpx
import pytest
from app.config import settings
from app.models.mgmt import HmsStaffRole, TenantRegistry
from app.services import hospital_directory
from pydantic import SecretStr
from shared.onboarding.receipts import ActivationReceipt

from .test_workspace_sessions import platform_auth
from .test_workspace_sessions import workspace as _workspace

hospital_workspace = _workspace
PATH = "/v1/hospital-profile"
SECRET = "isolated-hms-to-directory-service-secret-2026"


@pytest.fixture
async def directory_workspace(hospital_workspace, test_session_factory, monkeypatch):
    client, owner, first, second, member, _ = hospital_workspace
    receipt = ActivationReceipt(
        id=uuid4(), applicant_id=owner, resource_id=first.id, role="hospital", request_hash="a" * 64
    )
    async with test_session_factory() as db:
        db.add(receipt)
        await db.commit()
    monkeypatch.setattr(settings, "hospital_directory_secret", SecretStr(SECRET))
    monkeypatch.setattr(settings, "hospital_service_url", "http://directory.test")
    response = await client.post(
        "/v1/auth/workspace-session",
        json={"hospital_id": str(first.id)},
        headers=platform_auth(owner),
    )
    assert response.status_code == 200, response.text
    auth = {"Authorization": "Bearer " + response.json()["access_token"]}
    state = {
        "status": 200,
        "body": {
            "hospital_id": str(first.id),
            "version": 1,
            "draft": {"name": "Hospital A", "insurance_accepted": []},
            "published": None,
            "is_listed": False,
            "has_unpublished_changes": False,
            "last_published_at": None,
            "publication_issues": [],
            "accreditation": None,
            "accreditation_status": "pending",
        },
    }
    calls = []
    real_client = httpx.AsyncClient

    def respond(request):
        calls.append(request)
        assert request.url.host == "directory.test"
        assert request.headers["x-hospital-directory-secret"] == SECRET
        assert "authorization" not in request.headers
        if state.get("error"):
            raise state["error"]
        body = (
            {"items": [], "has_more": False}
            if request.url.path.endswith("/history")
            else state["body"]
        )
        return httpx.Response(state["status"], json=body, headers=state.get("headers"))

    monkeypatch.setattr(
        hospital_directory.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs),
    )
    return client, auth, owner, first, second, member, receipt, calls, state


async def test_current_administrator_reads_and_changes_only_selected_approved_hospital(
    directory_workspace,
):
    client, auth, owner, first, second, _, _, calls, _ = directory_workspace
    response = await client.get(
        PATH,
        headers={**auth, "X-Tenant-ID": str(second.id)},
        params={"hospital_id": str(second.id), "owner_user_id": str(uuid4())},
    )
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    assert response.json()["hospital_id"] == str(first.id)
    assert calls[-1].url.path == f"/internal/hospital-profiles/{first.id}"
    assert calls[-1].url.params["owner_user_id"] == str(owner)
    edit = await client.patch(
        PATH, headers=auth, json={"version": 1, "changes": {"description": "Updated description"}}
    )
    assert edit.status_code == 200, edit.text
    assert json.loads(calls[-1].content) == {
        "version": 1,
        "changes": {"description": "Updated description"},
        "actor_id": str(owner),
        "owner_user_id": str(owner),
    }
    for operation in ("publish", "withdraw"):
        assert (
            await client.post(f"{PATH}/{operation}", headers=auth, json={"version": 1})
        ).status_code == 200
        assert calls[-1].url.path.endswith("/" + operation)
    history = await client.get(PATH + "/history", headers=auth, params={"offset": 20})
    assert history.json() == {"items": [], "has_more": False}
    assert calls[-1].url.params["offset"] == "20"
    assert SECRET not in response.text


@pytest.mark.parametrize(
    "change",
    ["demoted", "revoked", "disabled", "unprovisioned", "missing_receipt", "ambiguous_receipt"],
)
async def test_access_and_approval_are_rechecked_before_calling_directory(
    directory_workspace, test_session_factory, change
):
    client, auth, owner, first, _, member, receipt, calls, _ = directory_workspace
    async with test_session_factory() as db:
        if change == "demoted":
            (await db.get(HmsStaffRole, member.id)).hms_role = "nurse"
        elif change == "revoked":
            (await db.get(HmsStaffRole, member.id)).is_active = False
        elif change == "disabled":
            (await db.get(TenantRegistry, first.id)).is_active = False
        elif change == "unprovisioned":
            (await db.get(TenantRegistry, first.id)).provisioned_at = None
        elif change == "missing_receipt":
            await db.delete(await db.get(ActivationReceipt, receipt.id))
        else:
            db.add(
                ActivationReceipt(
                    id=uuid4(),
                    applicant_id=owner,
                    resource_id=first.id,
                    role="hospital",
                    request_hash="b" * 64,
                )
            )
        await db.commit()
    response = await client.post(
        PATH + "/publish", headers={**auth, "X-HMS-Role": "hospital_admin"}, json={"version": 1}
    )
    assert response.status_code in {404, 409}, response.text
    assert not calls


@pytest.mark.parametrize(
    "payload",
    [
        {"version": 1, "changes": {"description": "New"}, "actor_id": str(uuid4())},
        {"version": 1, "changes": {"description": "New"}, "owner_user_id": str(uuid4())},
        {"version": 1, "changes": {"description": "New"}, "hospital_id": str(uuid4())},
        {"version": 1, "changes": {"is_listable": True}},
        {"version": 0, "changes": {"description": "New"}},
    ],
)
async def test_browser_cannot_supply_authority_fields_or_invalid_version(
    directory_workspace, payload
):
    client, auth, _, _, _, _, _, calls, _ = directory_workspace
    assert (await client.patch(PATH, headers=auth, json=payload)).status_code == 422
    assert not calls


async def test_platform_token_and_foreign_routes_do_not_bypass_workspace_boundary(
    directory_workspace,
):
    client, auth, owner, _, second, _, _, calls, _ = directory_workspace
    assert (
        await client.get(PATH, headers=platform_auth(owner, role="platform_admin"))
    ).status_code == 401
    assert (await client.get(f"{PATH}/{second.id}", headers=auth)).status_code == 404
    assert not calls


@pytest.mark.parametrize(
    "status,expected", [(401, 503), (500, 503), (307, 503), (404, 404), (409, 409)]
)
async def test_upstream_failures_are_not_replayed_or_exposed(directory_workspace, status, expected):
    client, auth, _, _, _, _, _, calls, state = directory_workspace
    state.update(
        status=status, body={"detail": SECRET}, headers={"Location": "https://untrusted.example"}
    )
    response = await client.post(PATH + "/publish", headers=auth, json={"version": 1})
    assert response.status_code == expected and SECRET not in response.text
    assert len(calls) == 1


async def test_timeout_requires_reload_and_does_not_replay_publication(directory_workspace):
    client, auth, _, _, _, _, _, calls, state = directory_workspace
    state["error"] = httpx.ReadTimeout("delayed directory response")
    response = await client.post(PATH + "/publish", headers=auth, json={"version": 1})
    assert response.status_code == 503 and "Reload" in response.text
    assert len(calls) == 1


async def test_validation_response_removes_input_and_credentials(directory_workspace):
    client, auth, _, _, _, _, _, _, state = directory_workspace
    state.update(
        status=422,
        body={
            "detail": [
                {
                    "loc": ["body", "contact_email"],
                    "msg": "Invalid " + SECRET,
                    "input": SECRET,
                    "ctx": {"secret": SECRET},
                }
            ]
        },
    )
    response = await client.patch(
        PATH, headers=auth, json={"version": 1, "changes": {"contact_email": "invalid"}}
    )
    assert response.status_code == 422 and SECRET not in response.text
    assert "input" not in response.text and "ctx" not in response.text


@pytest.mark.parametrize("change", ["hospital", "credentials"])
async def test_invalid_upstream_profile_is_not_returned(directory_workspace, change):
    client, auth, _, _, _, _, _, _, state = directory_workspace
    if change == "hospital":
        state["body"]["hospital_id"] = str(uuid4())
    else:
        state["body"]["access_token"] = SECRET
    response = await client.get(PATH, headers=auth)
    assert response.status_code == 502 and SECRET not in response.text


@pytest.mark.parametrize("change", ["missing_secret", "shared_secret", "bad_url"])
async def test_missing_or_reused_configuration_fails_closed(
    directory_workspace, monkeypatch, change
):
    client, auth, _, _, _, _, _, calls, _ = directory_workspace
    if change == "missing_secret":
        monkeypatch.setattr(settings, "hospital_directory_secret", SecretStr(""))
    elif change == "shared_secret":
        monkeypatch.setattr(
            settings, "hospital_directory_secret", settings.workspace_session_secret
        )
    else:
        monkeypatch.setattr(settings, "hospital_service_url", "http://user:password@directory.test")
    assert (await client.get(PATH, headers=auth)).status_code == 503
    assert not calls

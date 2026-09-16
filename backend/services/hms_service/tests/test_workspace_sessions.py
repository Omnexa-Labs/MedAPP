import time
from datetime import UTC, datetime
from uuid import uuid4

import jwt
import pytest
from app import deps
from app.config import settings
from app.main import create_app
from app.models.mgmt import HmsStaffRole, TenantRegistry
from app.routers import workspace_sessions
from app.session_tokens import issue_workspace_session
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from shared.auth.jwt import issue_access_token


def platform_auth(user_id, role="user", ttl=15):
    return {
        "Authorization": "Bearer "
        + issue_access_token(
            subject=str(user_id), role=role, secret=settings.jwt_secret, ttl_minutes=ttl
        )
    }


@pytest.fixture
async def workspace(test_session_factory, monkeypatch):
    owner = uuid4()
    first = TenantRegistry(
        hospital_name="Hospital A",
        slug="hospital-a",
        database_url="postgresql://secret@db/a",
        provisioned_at=datetime.now(UTC),
    )
    second = TenantRegistry(
        hospital_name="Hospital B",
        slug="hospital-b",
        database_url="postgresql://secret@db/b",
        provisioned_at=datetime.now(UTC),
    )
    async with test_session_factory() as db:
        db.add_all([first, second])
        await db.flush()
        membership = HmsStaffRole(tenant_id=first.id, user_id=owner, hms_role="hospital_admin")
        db.add(membership)
        await db.commit()
    monkeypatch.setattr(settings, "dev_mode", False)
    monkeypatch.setattr(deps, "MgmtSessionLocal", test_session_factory)
    checked = []

    async def verify(authorization, subject):
        checked.append(subject)

    monkeypatch.setattr(workspace_sessions, "verify_account", verify)
    application = create_app()

    async def database():
        async with test_session_factory() as db, db.begin():
            yield db

    application.dependency_overrides[deps.get_mgmt_db] = database
    application.dependency_overrides[deps.get_tenant_db] = database
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        yield client, owner, first, second, membership, checked


async def test_platform_session_selects_only_current_membership_and_issues_bounded_hms_token(
    workspace,
):
    client, owner, first, second, _, checked = workspace
    auth = platform_auth(owner, ttl=1)
    listing = await client.get("/v1/auth/workspaces", headers=auth)
    assert listing.status_code == 200 and listing.headers["cache-control"] == "no-store"
    assert listing.json() == [
        {
            "hospital_id": str(first.id),
            "hospital_name": first.hospital_name,
            "hms_role": "hospital_admin",
        }
    ]
    assert "database_url" not in listing.text and "secret" not in listing.text
    assert (
        await client.post(
            "/v1/auth/workspace-session", headers=auth, json={"hospital_id": str(second.id)}
        )
    ).status_code == 404
    response = await client.post(
        "/v1/auth/workspace-session", headers=auth, json={"hospital_id": str(first.id)}
    )
    assert response.status_code == 200, response.text
    result = response.json()
    claims = jwt.decode(
        result["access_token"],
        settings.workspace_session_secret.get_secret_value(),
        algorithms=["HS256"],
        audience=settings.workspace_session_audience,
        issuer=settings.workspace_session_issuer,
    )
    parent = jwt.decode(auth["Authorization"].split()[1], options={"verify_signature": False})
    assert claims["hospital_id"] == str(first.id) and claims["sub"] == str(owner)
    assert claims["role"] == "hms_staff" and claims["typ"] == "access"
    assert claims["exp"] <= parent["exp"] and claims["exp"] <= time.time() + 300
    assert response.headers["cache-control"] == "no-store"
    assert checked == [str(owner)] * 3
    hms_auth = {"Authorization": "Bearer " + result["access_token"]}
    assert (await client.get("/v1/departments", headers=hms_auth)).status_code == 200
    assert (await client.get("/v1/tenants", headers=hms_auth)).status_code == 401
    assert (await client.get("/v1/auth/workspaces", headers=hms_auth)).status_code == 401


@pytest.mark.parametrize("change", ["revoked", "tenant_disabled", "unprovisioned"])
async def test_revoked_membership_or_unready_tenant_cannot_exchange(
    workspace, test_session_factory, change
):
    client, owner, first, _, membership, _ = workspace
    async with test_session_factory() as db, db.begin():
        if change == "revoked":
            (await db.get(HmsStaffRole, membership.id)).is_active = False
        else:
            tenant = await db.get(TenantRegistry, first.id)
            if change == "tenant_disabled":
                tenant.is_active = False
            else:
                tenant.provisioned_at = None
    auth = platform_auth(owner, role="admin")
    assert (await client.get("/v1/auth/workspaces", headers=auth)).json() == []
    assert (
        await client.post(
            "/v1/auth/workspace-session", headers=auth, json={"hospital_id": str(first.id)}
        )
    ).status_code == 404


async def test_existing_workspace_token_observes_membership_demotion(
    workspace, test_session_factory
):
    client, owner, first, _, membership, _ = workspace
    response = await client.post(
        "/v1/auth/workspace-session",
        headers=platform_auth(owner),
        json={"hospital_id": str(first.id)},
    )
    auth = {"Authorization": "Bearer " + response.json()["access_token"]}
    async with test_session_factory() as db, db.begin():
        (await db.get(HmsStaffRole, membership.id)).hms_role = "doctor"
    assert (
        await client.post("/v1/departments", headers=auth, json={"name": "New", "slug": "new"})
    ).status_code == 403
    assert (await client.get("/v1/departments", headers=auth)).status_code == 200


async def test_platform_token_and_forged_workspace_membership_do_not_authorize_operations(
    workspace,
):
    client, owner, _, second, _, _ = workspace
    assert (await client.get("/v1/departments", headers=platform_auth(owner))).status_code == 401
    token, _ = issue_workspace_session({"sub": str(owner), "exp": int(time.time()) + 60}, second.id)
    assert (
        await client.get("/v1/departments", headers={"Authorization": "Bearer " + token})
    ).status_code == 403


async def test_inactive_medapp_account_prevents_workspace_exchange(workspace, monkeypatch):
    client, owner, first, _, _, _ = workspace

    async def inactive(*args):
        raise HTTPException(401, "inactive account")

    monkeypatch.setattr(workspace_sessions, "verify_account", inactive)
    assert (
        await client.post(
            "/v1/auth/workspace-session",
            headers=platform_auth(owner),
            json={"hospital_id": str(first.id)},
        )
    ).status_code == 401


@pytest.mark.parametrize("secret", ["", "short", "same_as_platform", "missing_platform"])
async def test_unconfigured_or_shared_workspace_signing_key_is_rejected(
    workspace, monkeypatch, secret
):
    client, owner, first, _, _, _ = workspace
    auth = platform_auth(owner)
    monkeypatch.setattr(
        settings,
        "workspace_session_secret",
        SecretStr(settings.jwt_secret if secret == "same_as_platform" else secret),
    )
    if secret == "missing_platform":
        monkeypatch.setattr(settings, "jwt_secret", "")
        monkeypatch.setattr(
            settings,
            "workspace_session_secret",
            SecretStr("configured-workspace-key-2026-123456789"),
        )
    assert (
        await client.post(
            "/v1/auth/workspace-session",
            headers=auth,
            json={"hospital_id": str(first.id)},
        )
    ).status_code == 503


@pytest.mark.parametrize(
    "response_status,payload,expected",
    [
        (200, {"is_active": False}, 401),
        (200, {"is_active": True, "id": str(uuid4())}, 401),
        (401, {}, 401),
        (503, {}, 503),
        (302, {}, 503),
        (200, {}, 401),
        (200, {"is_active": True, "id": 123}, 401),
    ],
)
async def test_live_account_verification_fails_closed(
    monkeypatch, response_status, payload, expected
):
    import httpx

    real_client = httpx.AsyncClient
    subject = uuid4()
    monkeypatch.setattr(settings, "user_service_url", "http://identity.test")

    def respond(request):
        assert request.url.path == "/me"
        assert request.headers["authorization"] == "Bearer parent-token"
        return httpx.Response(response_status, json=payload)

    monkeypatch.setattr(
        workspace_sessions.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs),
    )
    with pytest.raises(HTTPException) as error:
        await workspace_sessions.verify_account("Bearer parent-token", str(subject))
    assert error.value.status_code == expected

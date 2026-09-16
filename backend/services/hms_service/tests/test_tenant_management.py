from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from app import deps
from app.models.mgmt import HmsStaffRole, TenantRegistry
from app.services import tenant_service
from sqlalchemy import func, select


def headers(user_id, role="user", **claims):
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "typ": "access",
        "aud": "medapp.platform",
        "iss": "medapp",
        "iat": now,
        "exp": now + timedelta(minutes=5),
        **claims,
    }
    payload = {key: value for key, value in payload.items() if value is not None}
    return {
        "Authorization": "Bearer "
        + jwt.encode(payload, deps.settings.jwt_secret, algorithm="HS256")
    }


@pytest.fixture
async def tenants(test_session_factory):
    owner, stranger = uuid4(), uuid4()
    first = TenantRegistry(
        hospital_name="Hospital A",
        slug="hospital-a",
        database_url="postgresql://owner:private-password@db/a",
        provisioned_at=datetime.now(UTC),
        config_json={"locale": {"language": "en"}},
    )
    second = TenantRegistry(
        hospital_name="Hospital B",
        slug="hospital-b",
        database_url="postgresql://owner:private-password@db/b",
        provisioned_at=datetime.now(UTC),
        config_json={},
    )
    async with test_session_factory() as db:
        db.add_all([first, second])
        await db.flush()
        member = HmsStaffRole(tenant_id=first.id, user_id=owner, hms_role="hospital_admin")
        foreign = HmsStaffRole(tenant_id=second.id, user_id=stranger, hms_role="hospital_admin")
        db.add_all([member, foreign])
        await db.commit()
    return first, second, member, foreign


async def test_membership_grants_only_the_owned_workspace(client, tenants):
    first, second, member, _ = tenants
    auth = headers(member.user_id, hospital_id=str(second.id))
    listing = await client.get("/v1/tenants", headers=auth)
    assert listing.status_code == 200
    assert [row["tenant_id"] for row in listing.json()["items"]] == [str(first.id)]
    own = await client.get(f"/v1/tenants/{first.id}", headers=auth)
    assert own.status_code == 200
    assert "database_url" not in own.json()
    assert "private-password" not in own.text + listing.text
    assert (await client.get(f"/v1/tenants/{second.id}", headers=auth)).status_code == 404
    assert (
        await client.post(
            "/v1/tenants",
            headers=auth,
            json={
                "hospital_id": str(uuid4()),
                "hospital_name": "New",
                "slug": "new",
            },
        )
    ).status_code == 403


@pytest.mark.parametrize(
    "method,suffix,body",
    [
        ("GET", "", None),
        ("PATCH", "/config", {"config": {"branding": {"name": "Changed"}}}),
        ("GET", "/roles", None),
        ("POST", "/roles", {"user_id": str(uuid4()), "hms_role": "hospital_admin"}),
        ("DELETE", "/roles/{role_id}", None),
    ],
)
async def test_foreign_workspace_cannot_be_read_or_changed(
    client, tenants, test_session_factory, method, suffix, body
):
    _, second, member, foreign = tenants
    response = await client.request(
        method,
        f"/v1/tenants/{second.id}" + suffix.format(role_id=foreign.id),
        headers=headers(member.user_id, "hospital_admin"),
        json=body,
    )
    assert response.status_code == 404
    async with test_session_factory() as db:
        assert (await db.get(TenantRegistry, second.id)).config_json == {}
        assert (await db.get(HmsStaffRole, foreign.id)).is_active
        assert await db.scalar(select(func.count()).select_from(HmsStaffRole)) == 2


async def test_global_hospital_admin_role_without_membership_has_no_tenants(client, tenants):
    first, _, _, _ = tenants
    auth = headers(uuid4(), "hospital_admin")
    assert (await client.get("/v1/tenants", headers=auth)).json() == {"items": []}
    assert (await client.get(f"/v1/tenants/{first.id}", headers=auth)).status_code == 404


@pytest.mark.parametrize("change", ["deactivated", "demoted", "tenant_disabled", "not_provisioned"])
async def test_current_membership_and_tenant_readiness_override_old_token(
    client, tenants, test_session_factory, change
):
    first, _, member, _ = tenants
    auth = headers(member.user_id, "hospital_admin")
    assert (await client.get(f"/v1/tenants/{first.id}", headers=auth)).status_code == 200
    async with test_session_factory() as db:
        if change in {"deactivated", "demoted"}:
            row = await db.get(HmsStaffRole, member.id)
            if change == "deactivated":
                row.is_active = False
            else:
                row.hms_role = "doctor"
        else:
            row = await db.get(TenantRegistry, first.id)
            if change == "tenant_disabled":
                row.is_active = False
            else:
                row.provisioned_at = None
        await db.commit()
    assert (await client.get(f"/v1/tenants/{first.id}", headers=auth)).status_code == 404
    assert (await client.get("/v1/tenants", headers=auth)).json() == {"items": []}


@pytest.mark.parametrize("role", ["admin", "platform_admin"])
async def test_platform_operator_can_manage_tenants_without_exposing_dsns(client, tenants, role):
    first, second, _, _ = tenants
    auth = headers(uuid4(), role)
    response = await client.get("/v1/tenants", headers=auth)
    assert response.status_code == 200
    assert {row["tenant_id"] for row in response.json()["items"]} == {str(first.id), str(second.id)}
    assert "database_url" not in response.text and "private-password" not in response.text
    assert (
        await client.patch(
            f"/v1/tenants/{second.id}/config",
            headers=auth,
            json={"config": {"locale": {"language": "fr"}}},
        )
    ).status_code == 200


@pytest.mark.parametrize(
    "claims",
    [
        {"aud": "other"},
        {"iss": "other"},
        {"typ": "refresh"},
        {"typ": None},
        {"sub": "invalid-uuid"},
        {"role": None},
        {"exp": None},
        {"exp": datetime.now(UTC) - timedelta(minutes=1)},
    ],
)
async def test_management_requires_valid_platform_access_token(client, tenants, claims):
    assert (await client.get("/v1/tenants", headers=headers(uuid4(), **claims))).status_code == 401


async def test_management_missing_credentials_and_configuration_fail_closed(client, monkeypatch):
    assert (await client.get("/v1/tenants", headers={"Authorization": ""})).status_code == 401
    monkeypatch.setattr(deps.settings, "jwt_secret", "")
    assert (await client.get("/v1/tenants", headers={"Authorization": ""})).status_code == 503


async def test_owner_can_configure_and_assign_roles_but_cannot_remove_last_admin(
    client, tenants, test_session_factory
):
    first, _, member, foreign = tenants
    base = f"/v1/tenants/{first.id}"
    auth = headers(member.user_id)
    update = await client.patch(
        base + "/config", headers=auth, json={"config": {"branding": {"name": "A"}}}
    )
    assert update.status_code == 200
    assert update.json()["config_json"] == {"locale": {"language": "en"}, "branding": {"name": "A"}}
    assert (await client.delete(base + f"/roles/{foreign.id}", headers=auth)).status_code == 404
    assert (await client.delete(base + f"/roles/{member.id}", headers=auth)).status_code == 409
    assert (
        await client.post(
            base + "/roles",
            headers=auth,
            json={"user_id": str(member.user_id), "hms_role": "doctor"},
        )
    ).status_code == 409
    second_admin = await client.post(
        base + "/roles", headers=auth, json={"user_id": str(uuid4()), "hms_role": "hospital_admin"}
    )
    assert second_admin.status_code == 201
    assert (await client.get(base + "/roles", headers=auth)).status_code == 200
    assert (await client.delete(base + f"/roles/{member.id}", headers=auth)).status_code == 204
    assert (await client.get(base, headers=auth)).status_code == 404
    async with test_session_factory() as db:
        assert not (await db.get(HmsStaffRole, member.id)).is_active


async def test_missing_tenant_cannot_receive_orphan_role(client, test_session_factory):
    response = await client.post(
        f"/v1/tenants/{uuid4()}/roles",
        headers=headers(uuid4(), "admin"),
        json={"user_id": str(uuid4()), "hms_role": "hospital_admin"},
    )
    assert response.status_code == 404
    async with test_session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(HmsStaffRole)) == 0


async def test_platform_creation_and_repeat_preserve_saved_workspace(
    client, test_session_factory, monkeypatch
):
    calls = []
    monkeypatch.setattr(tenant_service, "provision_database", lambda *args: calls.append(args))
    payload = {"hospital_id": str(uuid4()), "hospital_name": "New Hospital", "slug": "new-hospital"}
    auth = headers(uuid4(), "platform_admin")
    response = await client.post("/v1/tenants", headers=auth, json=payload)
    assert response.status_code == 201, response.text
    assert "database_url" not in response.text and response.json()["provisioned_at"]
    target = "/v1/tenants/" + payload["hospital_id"]
    assert (
        await client.patch(target + "/config", headers=auth, json={"config": {"updated": True}})
    ).status_code == 200
    replay = await client.post("/v1/tenants", headers=auth, json=payload)
    assert replay.status_code == 201 and replay.json()["config_json"]["updated"]
    assert len(calls) == 1


async def test_deactivated_replacement_admin_does_not_allow_owner_removal(
    client, tenants, test_session_factory
):
    first, _, member, _ = tenants
    async with test_session_factory() as db:
        db.add(
            HmsStaffRole(
                tenant_id=first.id, user_id=uuid4(), hms_role="hospital_admin", is_active=False
            )
        )
        await db.commit()
    response = await client.delete(
        f"/v1/tenants/{first.id}/roles/{member.id}", headers=headers(member.user_id)
    )
    assert response.status_code == 409

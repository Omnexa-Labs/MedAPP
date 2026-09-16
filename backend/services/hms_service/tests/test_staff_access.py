import hashlib
import time
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from app.models.mgmt import HmsStaffRole, TenantRegistry
from app.models.staff import StaffMember
from app.models.staff_invitation import StaffAccessEvent, StaffInvitation
from app.routers import workspace_sessions
from app.services import staff_access
from app.session_tokens import issue_workspace_session
from fastapi import HTTPException
from sqlalchemy import func, select

from .test_workspace_sessions import platform_auth
from .test_workspace_sessions import workspace as _workspace

hospital_workspace = _workspace


async def test_staff_records_search_employee_id_page_and_reject_blank_names(client):
    from .test_staff import _staff_payload

    first = await client.post("/v1/staff", json=_staff_payload())
    assert first.status_code == 201
    second = await client.post("/v1/staff", json={**_staff_payload(), "employee_id": "EMP-002"})
    assert second.status_code == 201
    page = await client.get("/v1/staff", params={"limit": 1})
    assert len(page.json()["items"]) == 1 and page.json()["has_more"]
    other = await client.get("/v1/staff", params={"limit": 1, "offset": 1})
    assert len(other.json()["items"]) == 1 and not other.json()["has_more"]
    assert other.json()["items"][0]["staff_id"] != page.json()["items"][0]["staff_id"]
    found = await client.get("/v1/staff", params={"search": "EMP-002"})
    assert [row["staff_id"] for row in found.json()["items"]] == [second.json()["staff_id"]]
    target = "/v1/staff/" + first.json()["staff_id"]
    assert (await client.patch(target, json={"employee_id": "EMP-002"})).status_code == 409
    assert (await client.patch(target, json={"first_name": "  "})).status_code == 422
    assert (await client.patch(target, json={"last_name": None})).status_code == 422


def hospital_auth(user, hospital):
    token, _ = issue_workspace_session(
        {"sub": str(user), "exp": int(time.time()) + 240}, hospital.id
    )
    return {"Authorization": "Bearer " + token}


@pytest.fixture
async def team(hospital_workspace, test_session_factory, monkeypatch):
    client, owner, hospital, other, owner_role, _checked = hospital_workspace
    recipient = uuid4()
    identities = {
        str(recipient): {
            "id": str(recipient),
            "first_name": "Ama",
            "last_name": "Mensah",
            "email": "ama@example.com",
            "email_verified": True,
            "is_active": True,
            "role": "user",
        }
    }

    async def verify(authorization, subject):
        return identities.get(
            str(subject), {"id": str(subject), "email": "other@example.com", "email_verified": True}
        )

    async def tenant_session(tenant_id):
        assert tenant_id == str(hospital.id)
        return test_session_factory()

    monkeypatch.setattr(workspace_sessions, "verify_account", verify)
    monkeypatch.setattr(staff_access.tenant_db_manager, "get_session", tenant_session)
    return client, owner, hospital, other, owner_role, recipient, identities


async def invite(team, **overrides):
    client, owner, hospital, *_ = team
    response = await client.post(
        "/v1/team/invitations",
        headers=hospital_auth(owner, hospital),
        json={"email": "AMA@example.com", "hms_role": "nurse", **overrides},
    )
    assert response.status_code == 201, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


async def accept(team, code):
    return await team[0].post(
        "/v1/auth/staff-invitations/accept", headers=platform_auth(team[5]), json={"code": code}
    )


async def test_email_bound_invitation_creates_profile_membership_and_audit_without_changing_platform_role(
    team, test_session_factory
):
    client, owner, hospital, _, _, recipient, identities = team
    created = await invite(team, employee_id="EMP-22", title="Nurse")
    preview = await client.post(
        "/v1/auth/staff-invitations/inspect",
        headers=platform_auth(recipient),
        json={"code": created["code"]},
    )
    assert preview.status_code == 200 and preview.json()["hospital_name"] == hospital.hospital_name
    joined = await accept(team, created["code"])
    assert joined.status_code == 200, joined.text
    assert joined.json()["already_joined"] is False
    assert (await accept(team, created["code"])).json()["already_joined"] is True
    assert identities[str(recipient)]["role"] == "user"
    roster = await client.get("/v1/team/memberships", headers=hospital_auth(owner, hospital))
    member = next(item for item in roster.json()["items"] if item["user_id"] == str(recipient))
    assert (
        member["name"] == "Ama Mensah" and member["hms_role"] == "nurse" and member["version"] == 1
    )
    async with test_session_factory() as db:
        profile = await db.scalar(select(StaffMember).where(StaffMember.user_id == recipient))
        assert profile.employee_id == "EMP-22" and profile.title == "Nurse"
        record = await db.get(StaffInvitation, UUID(created["id"]))
        assert record.token_hash == hashlib.sha256(created["code"].encode()).hexdigest()
        assert record.staff_id == profile.id
        assert await db.scalar(select(func.count()).select_from(StaffAccessEvent)) == 2
    listing = await client.get("/v1/team/invitations", headers=hospital_auth(owner, hospital))
    assert created["code"] not in listing.text and "token_hash" not in listing.text
    assert listing.json()["items"][0]["status"] == "accepted"
    history = await client.get("/v1/team/history", headers=hospital_auth(owner, hospital))
    assert history.status_code == 200 and len(history.json()["items"]) == 2
    assert created["code"] not in history.text and "token_hash" not in history.text
    assert {row["action"] for row in history.json()["items"]} == {
        "invitation.created",
        "invitation.accepted",
    }


@pytest.mark.parametrize(
    "reason",
    [
        "wrong_email",
        "unverified",
        "cancelled",
        "expired",
        "superseded",
        "disabled_hospital",
        "inviter_changed",
    ],
)
async def test_unusable_invitation_cannot_grant_access(team, test_session_factory, reason):
    client, owner, hospital, _, owner_role, recipient, identities = team
    invitation = await invite(team)
    if reason == "wrong_email":
        identities[str(recipient)]["email"] = "wrong@example.com"
    elif reason == "unverified":
        identities[str(recipient)]["email_verified"] = False
    elif reason == "cancelled":
        assert (
            await client.delete(
                "/v1/team/invitations/" + invitation["id"], headers=hospital_auth(owner, hospital)
            )
        ).status_code == 204
    elif reason == "superseded":
        await invite(team)
    else:
        async with test_session_factory() as db, db.begin():
            if reason == "expired":
                (await db.get(StaffInvitation, UUID(invitation["id"]))).expires_at = datetime.now(
                    UTC
                ) - timedelta(seconds=1)
            elif reason == "disabled_hospital":
                (await db.get(TenantRegistry, hospital.id)).is_active = False
            else:
                (await db.get(HmsStaffRole, owner_role.id)).version += 2
    response = await accept(team, invitation["code"])
    assert response.status_code in {403, 410}, response.text
    if reason == "inviter_changed":
        listing = await client.get("/v1/team/invitations", headers=hospital_auth(owner, hospital))
        assert listing.json()["items"][0]["status"] == "unavailable"
    async with test_session_factory() as db:
        assert (
            await db.scalar(select(StaffMember.id).where(StaffMember.user_id == recipient)) is None
        )
        assert (
            await db.scalar(select(HmsStaffRole.id).where(HmsStaffRole.user_id == recipient))
            is None
        )


async def test_member_changes_are_versioned_preserve_last_admin_and_revoke_existing_tokens(
    team, test_session_factory
):
    client, owner, hospital, _, owner_role, recipient, _ = team
    invitation = await invite(team)
    assert (await accept(team, invitation["code"])).status_code == 200
    admin = hospital_auth(owner, hospital)
    member = next(
        row
        for row in (await client.get("/v1/team/memberships", headers=admin)).json()["items"]
        if row["user_id"] == str(recipient)
    )
    path = "/v1/team/memberships/" + member["id"]
    patch = {"version": 1, "hms_role": "doctor", "is_active": True}
    assert (await client.patch(path, headers=admin, json=patch)).json()["version"] == 2
    assert (await client.patch(path, headers=admin, json=patch)).status_code == 409
    staff_auth = hospital_auth(recipient, hospital)
    assert (await client.get("/v1/departments", headers=staff_auth)).status_code == 200
    assert (
        await client.patch(path, headers=admin, json={**patch, "version": 2, "is_active": False})
    ).status_code == 200
    assert (await client.get("/v1/departments", headers=staff_auth)).status_code == 403
    assert (await accept(team, invitation["code"])).status_code == 410
    assert (
        await client.patch(path, headers=admin, json={**patch, "version": 3})
    ).status_code == 409
    assert (
        await client.patch(
            f"/v1/team/memberships/{owner_role.id}",
            headers=admin,
            json={"version": 1, "hms_role": "doctor", "is_active": True},
        )
    ).status_code == 409
    assert (
        await client.patch(
            f"/v1/team/memberships/{owner_role.id}",
            headers=admin,
            json={"version": 1, "hms_role": "hospital_admin", "is_active": False},
        )
    ).status_code == 409


async def test_nonadmin_and_cross_hospital_requests_cannot_manage_team(team, test_session_factory):
    client, owner, hospital, other, _, recipient, _ = team
    invitation = await invite(team)
    async with test_session_factory() as db, db.begin():
        db.add(HmsStaffRole(tenant_id=hospital.id, user_id=recipient, hms_role="department_head"))
    assert (
        await client.get("/v1/team/invitations", headers=hospital_auth(recipient, hospital))
    ).status_code == 404
    assert (
        await client.post(
            "/v1/team/invitations",
            headers=platform_auth(owner, role="admin"),
            json={"email": "x@example.com", "hms_role": "nurse"},
        )
    ).status_code in {400, 401}
    assert (
        await client.delete(
            f"/v1/team/invitations/{invitation['id']}", headers=hospital_auth(owner, other)
        )
    ).status_code in {403, 404}
    assert (
        await client.post(
            "/v1/team/invitations",
            headers=hospital_auth(owner, hospital),
            json={"email": "x@example.com", "hms_role": "nurse", "user_id": str(recipient)},
        )
    ).status_code == 422
    assert (
        await client.post(
            "/v1/auth/staff-invitations/accept",
            headers=hospital_auth(owner, hospital),
            json={"code": invitation["code"]},
        )
    ).status_code == 401


async def test_profile_commit_failure_never_grants_access_and_retry_preserves_saved_profile(
    team, test_session_factory, monkeypatch
):
    invitation = await invite(team)
    original = staff_access.assign_hms_role

    async def fail(*args):
        raise HTTPException(503, "Management commit unavailable")

    monkeypatch.setattr(staff_access, "assign_hms_role", fail)
    assert (await accept(team, invitation["code"])).status_code == 503
    async with test_session_factory() as db, db.begin():
        profile = await db.scalar(select(StaffMember).where(StaffMember.user_id == team[5]))
        assert profile is not None
        profile.title = "Edited after interrupted join"
        assert (
            await db.scalar(select(HmsStaffRole.id).where(HmsStaffRole.user_id == team[5])) is None
        )
        assert (await db.get(StaffInvitation, UUID(invitation["id"]))).accepted_at is None
    monkeypatch.setattr(staff_access, "assign_hms_role", original)
    assert (await accept(team, invitation["code"])).status_code == 200
    async with test_session_factory() as db:
        profiles = (
            await db.scalars(select(StaffMember).where(StaffMember.user_id == team[5]))
        ).all()
        assert len(profiles) == 1 and profiles[0].title == "Edited after interrupted join"


async def test_old_invite_does_not_restore_access_changed_after_creation(
    team, test_session_factory
):
    invitation = await invite(team)
    async with test_session_factory() as db, db.begin():
        db.add(
            HmsStaffRole(tenant_id=team[2].id, user_id=team[5], hms_role="nurse", is_active=False)
        )
    assert (await accept(team, invitation["code"])).status_code == 409


async def test_invalid_department_duplicate_employee_and_inactive_profile_are_recoverable(
    team, test_session_factory
):
    client, owner, hospital, _, _, recipient, _ = team
    bad = await client.post(
        "/v1/team/invitations",
        headers=hospital_auth(owner, hospital),
        json={"email": "ama@example.com", "hms_role": "nurse", "department_id": str(uuid4())},
    )
    assert bad.status_code == 409
    async with test_session_factory() as db, db.begin():
        db.add(
            StaffMember(
                user_id=recipient,
                first_name="Existing",
                last_name="Member",
                employee_id="IN-USE",
                is_active=False,
            )
        )
    bad = await client.post(
        "/v1/team/invitations",
        headers=hospital_auth(owner, hospital),
        json={"email": "ama@example.com", "hms_role": "nurse", "employee_id": "IN-USE"},
    )
    assert bad.status_code == 409
    invitation = await invite(team)
    assert (await accept(team, invitation["code"])).status_code == 409

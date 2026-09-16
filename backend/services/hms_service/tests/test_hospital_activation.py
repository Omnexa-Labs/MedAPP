from datetime import UTC, datetime
from uuid import uuid4

import pytest
from app.config import settings
from app.models.mgmt import HmsStaffRole, TenantRegistry
from app.services import hospital_activation, tenant_service
from pydantic import SecretStr
from shared.onboarding.organizations import HospitalWorkspaceActivation, hospital_resource_id
from shared.onboarding.receipts import ActivationReceipt
from sqlalchemy import func, select

PATH = "/internal/hospital-activations"
SECRET = "hms-organization-activation-test-secret-2026"


@pytest.fixture
def command():
    application_id = uuid4()
    return HospitalWorkspaceActivation(
        application_id=application_id,
        applicant_id=uuid4(),
        reviewer_id=uuid4(),
        approval_version=9,
        hospital_id=hospital_resource_id(application_id),
        name="Approved Hospital",
        address_line1="1 Hospital Road",
        city="Accra",
        country="GH",
        contact_email="office@example.com",
        contact_phone="+233200000000",
    )


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "onboarding_activation_secret", SecretStr(SECRET))
    monkeypatch.setattr(settings, "dev_mode", False)
    monkeypatch.setattr(tenant_service, "provision_database", lambda *args: None)

    async def ready(tenant):
        assert tenant.is_active and tenant.provisioned_at

    monkeypatch.setattr(hospital_activation, "validate_workspace", ready)


async def send(client, command, secret=SECRET):
    return await client.post(
        PATH,
        json=command.model_dump(mode="json"),
        headers={"Authorization": "", "X-Activation-Secret": secret},
    )


async def test_activation_commits_ready_tenant_membership_and_receipt_together(
    client, command, test_session_factory
):
    response = await send(client, command)
    assert response.status_code == 200, response.text
    assert response.json()["resource_id"] == str(command.hospital_id)
    async with test_session_factory() as db:
        tenant = await db.get(TenantRegistry, command.hospital_id)
        assert tenant.hospital_name == command.name and tenant.is_active and tenant.provisioned_at
        role = await db.scalar(select(HmsStaffRole))
        assert role.user_id == command.applicant_id and role.tenant_id == command.hospital_id
        assert role.hms_role == "hospital_admin" and role.is_active
        tenant.config_json = {"owner_edited": True}
        await db.commit()
    assert (await send(client, command)).json() == response.json()
    async with test_session_factory() as db:
        assert (await db.get(TenantRegistry, command.hospital_id)).config_json == {
            "owner_edited": True
        }
        assert await db.scalar(select(func.count()).select_from(HmsStaffRole)) == 1
        assert await db.scalar(select(func.count()).select_from(ActivationReceipt)) == 1


@pytest.mark.parametrize(
    "change",
    ["disabled", "unprovisioned", "membership_removed", "membership_demoted", "membership_deleted"],
)
async def test_replay_cannot_restore_changed_workspace_access(
    client, command, test_session_factory, change
):
    assert (await send(client, command)).status_code == 200
    async with test_session_factory() as db:
        tenant = await db.get(TenantRegistry, command.hospital_id)
        member = await db.scalar(select(HmsStaffRole))
        if change == "disabled":
            tenant.is_active = False
        elif change == "unprovisioned":
            tenant.provisioned_at = None
        elif change == "membership_removed":
            member.is_active = False
        elif change == "membership_demoted":
            member.hms_role = "doctor"
        else:
            await db.delete(member)
        await db.commit()
    assert (await send(client, command)).status_code == 409


async def test_existing_unreceipted_workspace_is_not_claimed(client, command, test_session_factory):
    async with test_session_factory() as db:
        db.add(
            TenantRegistry(
                id=command.hospital_id,
                hospital_name="Existing",
                slug="existing",
                database_url="postgresql://existing",
                provisioned_at=datetime.now(UTC),
            )
        )
        await db.commit()
    assert (await send(client, command)).status_code == 409
    async with test_session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(HmsStaffRole)) == 0


async def test_failed_schema_confirmation_rolls_back_membership_registry_and_receipt(
    client, command, monkeypatch, test_session_factory
):
    from fastapi import HTTPException

    async def unavailable(_):
        raise HTTPException(503, "not ready")

    monkeypatch.setattr(hospital_activation, "validate_workspace", unavailable)
    assert (await send(client, command)).status_code == 503
    async with test_session_factory() as db:
        assert await db.get(TenantRegistry, command.hospital_id) is None
        assert await db.scalar(select(func.count()).select_from(HmsStaffRole)) == 0
        assert await db.scalar(select(func.count()).select_from(ActivationReceipt)) == 0


async def test_activation_requires_credentials_session_configuration_and_matching_identity(
    client, command, monkeypatch
):
    assert (await send(client, command, secret="wrong")).status_code == 401
    assert (
        await send(client, command.model_copy(update={"hospital_id": uuid4()}))
    ).status_code == 422
    assert (
        await send(client, command.model_copy(update={"reviewer_id": command.applicant_id}))
    ).status_code == 422
    monkeypatch.setattr(settings, "workspace_session_secret", SecretStr(""))
    assert (await send(client, command)).status_code == 503


async def test_changed_approval_snapshot_conflicts(client, command):
    assert (await send(client, command)).status_code == 200
    assert (
        await send(client, command.model_copy(update={"approval_version": 10}))
    ).status_code == 409

from uuid import UUID, uuid4

import pytest
from app.config import settings
from app.models import AccessAudit, HospitalProfile
from pydantic import SecretStr
from shared.onboarding.organizations import hospital_resource_id
from shared.onboarding.receipts import ActivationReceipt
from sqlalchemy import func, select

PATH = "/internal/hospital-activations"
SECRET = "hospital-directory-activation-test-secret-2026"


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "onboarding_activation_secret", SecretStr(SECRET))


@pytest.fixture
def command(principal_patient):
    return {
        "application_id": str(uuid4()),
        "applicant_id": principal_patient.subject,
        "reviewer_id": str(uuid4()),
        "approval_version": 8,
        "role": "hospital",
        "name": "Approved Hospital",
        "address_line1": "1 Hospital Road",
        "city": "Accra",
        "country": "GH",
        "contact_email": "office@example.com",
        "contact_phone": "+233200000000",
    }


async def send(client, command, secret=SECRET):
    return await client.post(PATH, json=command, headers={"X-Activation-Secret": secret})


async def test_approval_creates_owned_private_profile_and_replay_preserves_edits(
    anonymous_client, sessionmaker, command
):
    response = await send(anonymous_client, command)
    assert response.status_code == 200, response.text
    hospital_id = hospital_resource_id(UUID(command["application_id"]))
    assert response.json()["resource_id"] == str(hospital_id)
    async with sessionmaker() as db:
        hospital = await db.get(HospitalProfile, hospital_id)
        assert hospital.owner_user_id == UUID(command["applicant_id"])
        assert not hospital.is_listable and hospital.is_active
        hospital.name = "Edited hospital name"
        await db.commit()
    assert (await send(anonymous_client, command)).json() == response.json()
    async with sessionmaker() as db:
        assert (await db.get(HospitalProfile, hospital_id)).name == "Edited hospital name"
        assert await db.scalar(select(func.count()).select_from(HospitalProfile)) == 1
        assert await db.scalar(select(func.count()).select_from(ActivationReceipt)) == 1


async def test_private_profile_is_not_in_public_directory_detail_reviews_or_foreign_roster(
    anonymous_client, doctor_client, command
):
    response = await send(anonymous_client, command)
    hospital_id = response.json()["resource_id"]
    assert (await anonymous_client.get("/v1/hospitals")).json() == {"items": []}
    assert (await anonymous_client.get(f"/v1/hospitals/{hospital_id}")).status_code == 404
    assert (await anonymous_client.get(f"/v1/hospitals/{hospital_id}/reviews")).status_code == 404
    assert (await doctor_client.get(f"/v1/hospitals/{hospital_id}/staff")).status_code == 404


async def test_owner_can_manage_own_roster_without_global_hospital_role(
    anonymous_client, patient_client, admin_client, command, principal_doctor
):
    response = await send(anonymous_client, command)
    path = f"/v1/hospitals/{response.json()['resource_id']}/staff"
    payload = {"user_id": principal_doctor.subject, "role": "doctor"}
    assert (await patient_client.post(path, json=payload)).status_code == 201
    roster = await patient_client.get(path)
    assert roster.json()["includes_user_ids"]
    assert roster.json()["items"][0]["user_id"] == principal_doctor.subject
    assert (await admin_client.post(path, json=payload)).status_code == 403


async def test_foreign_global_hospital_admin_cannot_see_staff_identifiers(
    admin_client, platform_admin_client, hospital_sample, principal_doctor
):
    created = await platform_admin_client.post("/v1/hospitals", json=hospital_sample)
    path = f"/v1/hospitals/{created.json()['hospital_id']}/staff"
    assert (
        await platform_admin_client.post(
            path, json={"user_id": principal_doctor.subject, "role": "doctor"}
        )
    ).status_code == 201
    roster = (await admin_client.get(path)).json()
    assert not roster["includes_user_ids"] and roster["items"][0]["user_id"] is None


@pytest.mark.parametrize("change", ["owner", "inactive", "missing"])
async def test_old_approval_cannot_restore_changed_profile(
    anonymous_client, command, sessionmaker, change
):
    response = await send(anonymous_client, command)
    async with sessionmaker() as db:
        hospital = await db.get(HospitalProfile, UUID(response.json()["resource_id"]))
        if change == "owner":
            hospital.owner_user_id = uuid4()
        elif change == "inactive":
            hospital.is_active = False
        else:
            await db.delete(hospital)
        await db.commit()
    assert (await send(anonymous_client, command)).status_code == 409


@pytest.mark.parametrize(
    "change", [{"approval_version": 9}, {"name": "Changed command"}, {"applicant_id": str(uuid4())}]
)
async def test_conflicting_approval_cannot_overwrite_receipt(anonymous_client, command, change):
    assert (await send(anonymous_client, command)).status_code == 200
    assert (await send(anonymous_client, {**command, **change})).status_code == 409


async def test_activation_auth_and_independent_review_are_required(
    anonymous_client, command, monkeypatch
):
    assert (await send(anonymous_client, command, secret="wrong")).status_code == 401
    assert (
        await send(anonymous_client, {**command, "reviewer_id": command["applicant_id"]})
    ).status_code == 422
    assert (
        await send(anonymous_client, {**command, "hospital_id": str(uuid4())})
    ).status_code == 422
    monkeypatch.setattr(settings, "onboarding_activation_secret", SecretStr(""))
    assert (await send(anonymous_client, command)).status_code == 503


async def test_unreceipted_profile_is_not_adopted(anonymous_client, sessionmaker, command):
    async with sessionmaker() as db:
        db.add(
            HospitalProfile(
                id=hospital_resource_id(UUID(command["application_id"])),
                name="Existing",
                slug="existing",
                owner_user_id=UUID(command["applicant_id"]),
            )
        )
        await db.commit()
    assert (await send(anonymous_client, command)).status_code == 409


async def test_private_roster_access_records_platform_override_only(
    anonymous_client,
    patient_client,
    platform_admin_client,
    sessionmaker,
    command,
):
    created = await send(anonymous_client, command)
    hospital_id = created.json()["resource_id"]
    path = f"/v1/hospitals/{hospital_id}/staff"
    assert (await patient_client.get(path)).status_code == 200
    assert (await platform_admin_client.get(path)).status_code == 200
    async with sessionmaker() as db:
        rows = (await db.scalars(select(AccessAudit).order_by(AccessAudit.created_at))).all()
        assert len(rows) == 2
        assert [row.admin_override for row in rows] == [False, True]

from uuid import UUID, uuid4

import pytest
from app.config import settings
from app.models import DoctorProfile
from pydantic import SecretStr
from shared.onboarding.receipts import ActivationReceipt
from sqlalchemy import func, select

PATH = "/internal/professional-activations"
SECRET = "test-doctor-activation-only-secret-2026"


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "onboarding_activation_secret", SecretStr(SECRET))


def command(**overrides):
    return dict(
        application_id=str(uuid4()),
        applicant_id=str(uuid4()),
        reviewer_id=str(uuid4()),
        approval_version=5,
        role="doctor",
        first_name="Ama",
        last_name="Mensah",
        specialty="General practice",
        **overrides,
    )


async def send(client, payload, secret=SECRET):
    return await client.post(PATH, json=payload, headers={"X-Activation-Secret": secret})


async def test_internal_credential_is_required(client, monkeypatch):
    payload = command()
    assert (await send(client, payload, "incorrect")).status_code == 401
    assert (await client.post(PATH, json=payload)).status_code == 401
    monkeypatch.setattr(settings, "onboarding_activation_secret", SecretStr(""))
    assert (await send(client, payload)).status_code == 503


async def test_replay_preserves_profile_and_edits(client, session_factory):
    payload = command()
    first = await send(client, payload)
    assert first.status_code == 200, first.text
    profile_id = UUID(first.json()["resource_id"])
    async with session_factory() as db:
        profile = await db.get(DoctorProfile, profile_id)
        assert profile.user_id == UUID(payload["applicant_id"])
        assert profile.is_active and not profile.is_listable
        profile.first_name = "Updated name"
        await db.commit()
    replay = await send(client, payload)
    assert replay.json() == first.json()
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(DoctorProfile)) == 1
        assert await db.scalar(select(func.count()).select_from(ActivationReceipt)) == 1
        assert (await db.get(DoctorProfile, profile_id)).first_name == "Updated name"


async def test_changed_approval_cannot_reuse_receipt(client):
    payload = command()
    assert (await send(client, payload)).status_code == 200
    for field, value in (
        ("applicant_id", str(uuid4())),
        ("first_name", "Someone else"),
        ("approval_version", 6),
    ):
        assert (await send(client, {**payload, field: value})).status_code == 409


async def test_replay_does_not_reactivate_suspended_profile(client, session_factory):
    payload = command()
    first = await send(client, payload)
    async with session_factory() as db:
        profile = await db.get(DoctorProfile, UUID(first.json()["resource_id"]))
        profile.is_active = False
        await db.commit()
    assert (await send(client, payload)).status_code == 409


async def test_new_approval_links_existing_profile_without_resetting_it(client, session_factory):
    payload = command()
    first = await send(client, payload)
    second = await send(
        client, {**payload, "application_id": str(uuid4()), "first_name": "Another name"}
    )
    assert second.status_code == 200
    assert second.json()["resource_id"] == first.json()["resource_id"]
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(DoctorProfile)) == 1
        assert await db.scalar(select(func.count()).select_from(ActivationReceipt)) == 2


async def test_wrong_role_self_review_and_privileged_fields_are_rejected(client):
    payload = command()
    for changes in (
        {"role": "nurse"},
        {"reviewer_id": payload["applicant_id"]},
        {"is_listable": True},
        {"role": "admin"},
    ):
        assert (await send(client, {**payload, **changes})).status_code == 422

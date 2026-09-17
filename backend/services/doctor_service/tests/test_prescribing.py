from uuid import UUID, uuid4

import pytest
from app.models import DoctorProfile
from shared.onboarding.receipts import ActivationReceipt
from sqlalchemy import select

pytestmark = pytest.mark.asyncio


async def test_role_and_legacy_profile_are_not_prescribing_approval(
    client, session_factory, principal
):
    path = "/v1/doctors/me/prescribing-eligibility"
    assert (await client.get(path)).status_code == 404
    async with session_factory() as db, db.begin():
        profile = DoctorProfile(
            user_id=UUID(principal.subject), first_name="Doctor", last_name="Test", languages=[]
        )
        db.add(profile)
    assert (await client.get(path)).status_code == 403
    async with session_factory() as db, db.begin():
        profile = await db.scalar(select(DoctorProfile))
        db.add(
            ActivationReceipt(
                id=uuid4(),
                applicant_id=profile.user_id,
                resource_id=profile.id,
                role="doctor",
                request_hash="a" * 64,
            )
        )
    response = await client.get(path)
    assert response.status_code == 200 and response.json()["user_id"] == principal.subject
    async with session_factory() as db, db.begin():
        (await db.scalar(select(DoctorProfile))).is_active = False
    assert (await client.get(path)).status_code == 403

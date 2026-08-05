"""GET /v1/hospitals/{hospital_id}/staff — the roster, and what it withholds.

Three things are pinned here, in descending order of how much damage a
regression would do:

1. Anonymous callers get 401. This is the only non-public read on the router, so
   it is the only one where that assertion means anything.
2. `user_id` is withheld from ordinary readers and present for hospital admins.
3. The response says out loud that it carries no names, so a client can render
   an honest roster instead of an EmptyState claiming nothing was published.
"""

from __future__ import annotations

from uuid import UUID

import pytest
from app.models.hospital import HospitalStaff


async def _hospital_with_staff(admin_client, hospital_sample, principal_doctor):
    create_resp = await admin_client.post("/v1/hospitals", json=hospital_sample)
    assert create_resp.status_code == 201, create_resp.text
    hospital_id = create_resp.json()["hospital_id"]

    staff_resp = await admin_client.post(
        f"/v1/hospitals/{hospital_id}/staff",
        json={
            "user_id": principal_doctor.subject,
            "role": "doctor",
            "title": "Consultant Cardiologist",
            "department": "Cardiology",
        },
    )
    assert staff_resp.status_code == 201, staff_resp.text
    return hospital_id, staff_resp.json()["staff_id"]


@pytest.mark.asyncio
async def test_patient_reads_roster_without_names_or_user_ids(
    patient_client, admin_client, hospital_sample, principal_doctor
):
    hospital_id, staff_id = await _hospital_with_staff(admin_client, hospital_sample, principal_doctor)

    resp = await patient_client.get(f"/v1/hospitals/{hospital_id}/staff")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # The flags are the contract: a client that sees names_available=False knows
    # to render role/title/department and NOT to claim the directory is empty.
    assert body["names_available"] is False
    assert body["names_unavailable_reason"]
    assert body["includes_user_ids"] is False

    assert len(body["items"]) == 1
    entry = body["items"][0]
    assert entry["staff_id"] == staff_id
    assert entry["role"] == "doctor"
    assert entry["title"] == "Consultant Cardiologist"
    assert entry["department"] == "Cardiology"
    # Withheld, not absent from the record — an admin sees it below.
    assert entry["user_id"] is None
    # And no name or photo field was invented to fill the gap.
    for absent in ("name", "full_name", "display_name", "photo_url"):
        assert absent not in entry


@pytest.mark.asyncio
async def test_hospital_admin_sees_user_ids(
    admin_client, hospital_sample, principal_doctor
):
    """Whoever may write the roster already knows who is on it."""
    hospital_id, _ = await _hospital_with_staff(admin_client, hospital_sample, principal_doctor)

    resp = await admin_client.get(f"/v1/hospitals/{hospital_id}/staff")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["includes_user_ids"] is True
    assert body["items"][0]["user_id"] == principal_doctor.subject


@pytest.mark.asyncio
async def test_anonymous_caller_is_rejected(
    anonymous_client, admin_client, hospital_sample, principal_doctor
):
    """A roster is a list of people. The sibling public reads are facts about a
    building; this one requires an identified reader."""
    hospital_id, _ = await _hospital_with_staff(admin_client, hospital_sample, principal_doctor)

    resp = await anonymous_client.get(f"/v1/hospitals/{hospital_id}/staff")
    assert resp.status_code == 401, resp.text

    # Control: the hospital record itself is still public, so the 401 above is
    # about this endpoint's rule and not a broken fixture.
    public = await anonymous_client.get(f"/v1/hospitals/{hospital_id}")
    assert public.status_code == 200, public.text


@pytest.mark.asyncio
async def test_unknown_hospital_is_404_not_an_empty_roster(patient_client):
    """An empty list cannot distinguish "no staff yet" from "wrong id", and that
    ambiguity is what left the designed screen showing a misleading EmptyState."""
    resp = await patient_client.get("/v1/hospitals/99999999-9999-4999-8999-999999999999/staff")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_inactive_staff_are_excluded_even_for_admins(
    sessionmaker, admin_client, patient_client, hospital_sample, principal_doctor
):
    """A former employee's placement is history, not a current fact.

    Admins get no override: a leavers list is a different endpoint with a
    different purpose, and quietly folding it into this one would widen what the
    roster discloses without anyone deciding to.
    """
    hospital_id, staff_id = await _hospital_with_staff(admin_client, hospital_sample, principal_doctor)

    async with sessionmaker() as session:
        member = await session.get(HospitalStaff, UUID(staff_id))
        member.is_active = False
        await session.commit()

    for client in (patient_client, admin_client):
        resp = await client.get(f"/v1/hospitals/{hospital_id}/staff")
        assert resp.status_code == 200, resp.text
        assert resp.json()["items"] == []


@pytest.mark.asyncio
async def test_roster_is_ordered_deterministically(
    admin_client, hospital_sample, principal_doctor, principal_patient
):
    """Ordered by role, so two reads of an unchanged roster are diffable."""
    create_resp = await admin_client.post("/v1/hospitals", json=hospital_sample)
    hospital_id = create_resp.json()["hospital_id"]

    for user_id, role in (
        (principal_doctor.subject, "nurse"),
        (principal_patient.subject, "doctor"),
    ):
        resp = await admin_client.post(
            f"/v1/hospitals/{hospital_id}/staff",
            json={"user_id": user_id, "role": role},
        )
        assert resp.status_code == 201, resp.text

    resp = await admin_client.get(f"/v1/hospitals/{hospital_id}/staff")
    assert [item["role"] for item in resp.json()["items"]] == ["doctor", "nurse"]

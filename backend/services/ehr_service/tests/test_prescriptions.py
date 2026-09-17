from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest
import pytest_asyncio
from app.deps import get_current_principal
from app.models import ClinicalPrescription, PrescriptionDelivery
from app.services.prescriber import PrescriberLookup, VerifiedDoctor, get_prescriber_lookup
from app.workers import prescriptions as worker
from fastapi import HTTPException
from sqlalchemy import func, select

pytestmark = pytest.mark.asyncio


def draft():
    return {
        "items": [
            {
                "drug_name": "Test medicine",
                "strength": "10mg",
                "form": "tablet",
                "dose": "1 tablet",
                "route": "Oral",
                "frequency": "Once daily",
                "duration": "5 days",
                "quantity": 5,
                "instructions": "As discussed at consultation",
            }
        ],
        "valid_until": (datetime.now(UTC).date() + timedelta(days=30)).isoformat(),
        "clinical_goal": "Clinician-entered test goal",
    }


@pytest_asyncio.fixture
async def prescribing(patient_client, doctor_client, principal_patient, principal_doctor):
    async def lookup(principal):
        if principal.role != "doctor":
            raise HTTPException(403, "only verified doctors may prescribe")
        return VerifiedDoctor(
            user_id=UUID(principal.subject),
            profile_id=uuid4(),
            approval_id=uuid4(),
            display_name="Verified doctor",
        )

    doctor_client._transport.app.dependency_overrides[get_prescriber_lookup] = lambda: lookup
    path = f"/v1/patients/{principal_patient.subject}"
    grant = await patient_client.post(
        path + "/consents",
        json={"doctor_user_id": principal_doctor.subject, "scope": "records_and_prescriptions"},
    )
    assert grant.status_code == 201, grant.text
    return doctor_client, patient_client, path + "/prescriptions", grant.json()


async def post(client, path, body, key=None):
    return await client.post(path, json=body, headers={"Idempotency-Key": str(key or uuid4())})


async def created(prescribing):
    doctor, patient, path, _ = prescribing
    response = await post(doctor, path, draft())
    assert response.status_code == 201, response.text
    return doctor, patient, path, response.json()


async def issued(prescribing):
    doctor, patient, path, rx = await created(prescribing)
    response = await post(
        doctor, f"{path}/{rx['id']}/issue", {"version": 1, "clinical_review_confirmed": True}
    )
    assert response.status_code == 200, response.text
    return doctor, patient, path, response.json()


async def test_draft_review_issue_patient_visibility_and_replay(prescribing, sessionmaker):
    doctor, patient, path, rx = await created(prescribing)
    assert (await patient.get(path)).json()["items"] == []
    assert (await patient.get(f"{path}/{rx['id']}")).status_code == 404
    key = uuid4()
    body = {"version": 1, "clinical_review_confirmed": True}
    first = await post(doctor, f"{path}/{rx['id']}/issue", body, key)
    assert first.status_code == 200, first.text
    assert (await post(doctor, f"{path}/{rx['id']}/issue", body, key)).json() == first.json()
    visible = await patient.get(f"{path}/{rx['id']}")
    assert visible.headers["cache-control"] == "no-store"
    assert visible.json()["status"] == "issued"
    assert visible.json()["items"] == draft()["items"]
    async with sessionmaker() as db:
        assert await db.scalar(select(func.count(ClinicalPrescription.id))) == 1


async def test_stale_updates_issued_immutability_and_replacement_history(prescribing):
    doctor, patient, path, rx = await issued(prescribing)
    url = f"{path}/{rx['id']}"
    response = await doctor.put(
        url, json={**draft(), "version": rx["version"]}, headers={"Idempotency-Key": str(uuid4())}
    )
    assert response.status_code == 409
    assert (
        await post(doctor, url + "/cancel", {"version": 1, "reason": "Changed plan"})
    ).status_code == 409
    replacement = await post(
        doctor, url + "/correct", {"version": 2, "reason": "Correction after clinical review"}
    )
    assert replacement.status_code == 200, replacement.text
    next_rx = replacement.json()
    assert (
        next_rx["replaces_id"] == rx["id"]
        and next_rx["status"] == "draft"
        and next_rx["version"] == 1
    )
    old = (await patient.get(url)).json()
    assert old["status"] == "superseded" and old["items"] == rx["items"]
    assert (await patient.get(f"{path}/{next_rx['id']}")).status_code == 404
    assert (
        await post(
            doctor, url + "/correct", {"version": old["version"], "reason": "Duplicate replacement"}
        )
    ).status_code == 409


async def test_revoked_access_blocks_writes_and_replays(prescribing):
    doctor, patient, path, grant = prescribing
    key = uuid4()
    assert (await post(doctor, path, draft(), key)).status_code == 201
    assert (
        await patient.delete(path.replace("prescriptions", "consents") + "/" + grant["consent_id"])
    ).status_code == 200
    assert (await post(doctor, path, draft(), key)).status_code == 403
    assert (await doctor.get(path)).status_code == 403


async def test_read_only_permission_does_not_grant_prescription_access(
    patient_client, doctor_client, principal_patient, principal_doctor
):
    path = f"/v1/patients/{principal_patient.subject}"
    await patient_client.post(
        path + "/consents", json={"doctor_user_id": principal_doctor.subject, "scope": "records"}
    )

    async def verified(principal):
        return VerifiedDoctor(
            user_id=UUID(principal.subject),
            profile_id=uuid4(),
            approval_id=uuid4(),
            display_name="Doctor",
        )

    doctor_client._transport.app.dependency_overrides[get_prescriber_lookup] = lambda: verified
    assert (await doctor_client.get(path + "/records")).status_code == 200
    assert (await doctor_client.get(path + "/prescriptions")).status_code == 403
    assert (await post(doctor_client, path + "/prescriptions", draft())).status_code == 403


@pytest.mark.parametrize("role", ["patient", "nurse", "admin"])
async def test_no_non_doctor_can_write(prescribing, role, principal_doctor):
    doctor, _, path, _ = prescribing
    replacement = type("Principal", (), {"subject": principal_doctor.subject, "role": role})()
    doctor._transport.app.dependency_overrides[get_current_principal] = lambda: replacement
    assert (await post(doctor, path, draft())).status_code == 403


async def test_other_patient_and_other_author_cannot_change_rx(prescribing, principal_doctor):
    doctor, patient, path, rx = await issued(prescribing)
    other_path = f"/v1/patients/{uuid4()}/prescriptions"
    assert (await patient.get(other_path)).status_code in {401, 403}
    assert (await doctor.get(other_path)).status_code == 403
    another = type("Principal", (), {"subject": str(uuid4()), "role": "doctor"})()
    doctor._transport.app.dependency_overrides[get_current_principal] = lambda: another
    assert (
        await post(doctor, f"{path}/{rx['id']}/cancel", {"version": 2, "reason": "Not my record"})
    ).status_code == 403


@pytest.mark.parametrize(
    "change",
    [
        {"items": []},
        {"items": [{**draft()["items"][0], "quantity": True}]},
        {"items": [{**draft()["items"][0], "dose": " "}]},
        {"author_id": str(uuid4())},
        {"valid_until": "2020-01-01"},
    ],
)
async def test_invalid_or_privileged_drafts_are_rejected(prescribing, change):
    doctor, _, path, _ = prescribing
    assert (await post(doctor, path, {**draft(), **change})).status_code == 422


async def test_issue_requires_explicit_review_and_key_is_bound_to_payload(prescribing):
    doctor, _, path, rx = await created(prescribing)
    assert (
        await post(
            doctor, f"{path}/{rx['id']}/issue", {"version": 1, "clinical_review_confirmed": False}
        )
    ).status_code == 422
    key = uuid4()
    assert (await post(doctor, path, draft(), key)).status_code == 201
    assert (
        await post(doctor, path, {**draft(), "clinical_goal": "Different"}, key)
    ).status_code == 409


async def test_routing_cancellation_and_confirmed_withdrawal_before_correction(
    prescribing, sessionmaker, monkeypatch
):
    doctor, _, path, rx = await issued(prescribing)
    url = f"{path}/{rx['id']}"
    response = await post(doctor, url + "/route", {"version": 2, "pharmacy_id": str(uuid4())})
    assert response.status_code == 200, response.text
    assert response.json()["deliveries"][0]["state"] == "queued"
    assert (
        await post(doctor, url + "/correct", {"version": 3, "reason": "Correct medication"})
    ).status_code == 409
    cancelled = await post(doctor, url + "/cancel", {"version": 3, "reason": "Withdraw and review"})
    assert cancelled.status_code == 200, cancelled.text
    assert (
        await post(doctor, url + "/correct", {"version": 4, "reason": "Correct medication"})
    ).status_code == 409

    async def delivered(payload):
        return (
            {
                "prescription_id": payload["prescription_id"],
                "pharmacy_id": payload["pharmacy_id"],
                "operation": payload["operation"],
                "pms_prescription_id": None,
                "accepted_item_count": 0,
            },
            None,
            False,
        )

    monkeypatch.setattr(worker, "deliver", delivered)
    assert await worker.run_once(sessionmaker)
    assert await worker.run_once(sessionmaker)
    corrected = await post(doctor, url + "/correct", {"version": 4, "reason": "Correct medication"})
    assert corrected.status_code == 200, corrected.text
    async with sessionmaker() as db:
        assert set(await db.scalars(select(PrescriptionDelivery.state))) == {
            "delivered",
            "withdrawn",
        }


@pytest.mark.parametrize("failure", ["inactive", "nurse", "unapproved", "wrong_identity", "outage"])
async def test_current_account_and_approval_required(monkeypatch, failure, principal_doctor):
    original = httpx.AsyncClient

    def handler(request):
        if request.url.path.startswith("/users/"):
            return httpx.Response(
                404 if failure == "inactive" else 200,
                json={
                    "user_id": principal_doctor.subject,
                    "display_name": "Doctor",
                    "role": "nurse" if failure == "nurse" else "doctor",
                },
            )
        return httpx.Response(
            403 if failure == "unapproved" else 503 if failure == "outage" else 200,
            json={
                "user_id": str(uuid4())
                if failure == "wrong_identity"
                else principal_doctor.subject,
                "profile_id": str(uuid4()),
                "approval_id": str(uuid4()),
            },
        )

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(handler)),
    )
    with pytest.raises(HTTPException):
        await PrescriberLookup("Bearer doctor")(principal_doctor)


@pytest.mark.parametrize("failure", ["html", "wrong_ack", "timeout", "503", "401"])
async def test_delivery_requires_matching_ack_and_retains_failures(
    prescribing, sessionmaker, monkeypatch, failure
):
    from app.config import settings
    from pydantic import SecretStr

    doctor, _, path, rx = await issued(prescribing)
    response = await post(
        doctor, f"{path}/{rx['id']}/route", {"version": 2, "pharmacy_id": str(uuid4())}
    )
    assert response.status_code == 200
    monkeypatch.setattr(
        settings, "clinical_handoff_secret", SecretStr("test-clinical-handoff-secret-at-least-32")
    )
    original = httpx.AsyncClient

    def handler(request):
        if failure == "timeout":
            raise httpx.ReadTimeout("offline", request=request)
        if failure in {"503", "401"}:
            return httpx.Response(int(failure), json={})
        if failure == "html":
            return httpx.Response(200, text="<html>Sign in</html>")
        return httpx.Response(
            200,
            json={
                "prescription_id": str(uuid4()),
                "pharmacy_id": str(uuid4()),
                "operation": "send",
                "pms_prescription_id": str(uuid4()),
                "accepted_item_count": 1,
            },
        )

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(handler)),
    )
    assert await worker.run_once(sessionmaker)
    async with sessionmaker() as db:
        delivery = await db.scalar(select(PrescriptionDelivery))
        assert delivery.state == ("attention" if failure == "401" else "queued")
        assert delivery.attempts == 1 and delivery.acknowledgement is None
        assert delivery.lease_token is None and delivery.error_code


async def test_expired_worker_lease_is_reclaimed(prescribing, sessionmaker):
    doctor, _, path, rx = await issued(prescribing)
    await post(doctor, f"{path}/{rx['id']}/route", {"version": 2, "pharmacy_id": str(uuid4())})
    abandoned = await worker.claim(sessionmaker)
    assert abandoned and await worker.claim(sessionmaker) is None
    async with sessionmaker() as db, db.begin():
        row = await db.get(PrescriptionDelivery, abandoned["id"])
        row.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
    recovered = await worker.claim(sessionmaker)
    assert recovered["id"] == abandoned["id"] and recovered["token"] != abandoned["token"]
    assert recovered["attempts"] == 2


async def test_nurse_cannot_receive_prescribing_scope(
    patient_client, principal_patient, principal_nurse
):
    response = await patient_client.post(
        f"/v1/patients/{principal_patient.subject}/consents",
        json={"doctor_user_id": principal_nurse.subject, "scope": "records_and_prescriptions"},
    )
    assert response.status_code == 400


async def test_cancelled_unissued_draft_stays_private_to_author(prescribing, sessionmaker):
    from app.models import Consent

    doctor, patient, path, rx = await created(prescribing)
    assert (
        await post(doctor, f"{path}/{rx['id']}/cancel", {"version": 1, "reason": "Discard draft"})
    ).status_code == 200
    assert (await patient.get(path)).json()["items"] == []
    other = uuid4()
    async with sessionmaker() as db, db.begin():
        db.add(
            Consent(
                patient_id=UUID(prescribing[3]["patient_id"]),
                doctor_user_id=other,
                scope="records_and_prescriptions",
                granted_by_user_id=UUID(rx["patient_user_id"]),
                granted_at=datetime.now(UTC),
            )
        )
    doctor._transport.app.dependency_overrides[get_current_principal] = lambda: type(
        "Principal", (), {"subject": str(other), "role": "doctor"}
    )()
    assert (await doctor.get(path)).json()["items"] == []
    assert (await doctor.get(f"{path}/{rx['id']}")).status_code == 404

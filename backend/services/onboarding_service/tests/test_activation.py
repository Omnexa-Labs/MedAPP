from uuid import UUID, uuid4

import httpx
import pytest
from app.config import settings
from app.models import ApplicationActivation, ApplicationEvent, PartnerApplication
from app.schemas.partner import ApplicationReviewRequest
from app.services.activation import ActivationClient, ActivationFailure, process_next
from app.services.partner_service import review_application
from pydantic import SecretStr
from shared.onboarding.contracts import ActivationResult, ProfessionalActivation
from shared.onboarding.organizations import HospitalActivationResult, hospital_resource_id
from shared.onboarding.pharmacies import PharmacyActivationResult, PharmacyWorkspaceRequest, PharmacyWorkspaceResult, pharmacy_resource_id
from sqlalchemy import func, select
from test_onboarding import BASE, match, ready, review


async def approved(applicant, admin, payload):
    application = await ready(applicant, payload)
    response = await review(
        admin,
        application,
        "approve",
        verified_document_ids=[d["document_id"] for d in application["documents"]],
    )
    assert response.status_code == 200, response.text
    return response.json()


class Receiver:
    def __init__(self, fail=None):
        self.calls = []
        self.profile_id = uuid4()
        self.fail = fail

    async def send(self, target, command):
        self.calls.append((target, command))
        if target == self.fail:
            raise ActivationFailure("activation_service_unavailable", True)
        return ActivationResult(
            application_id=command.application_id,
            applicant_id=command.applicant_id,
            role=command.role,
            resource_id=self.profile_id,
        )


async def test_approval_queues_profile_before_role_and_records_completion(
    doctor_client, admin_client, practitioner_payload, sessionmaker
):
    application = await approved(doctor_client, admin_client, practitioner_payload)
    target = f"{BASE}/{application['application_id']}/activation"
    assert (await doctor_client.get(target)).json()["state"] == "pending"
    receiver = Receiver()
    async with sessionmaker() as db:
        assert await process_next(db, receiver)
        await db.commit()
    assert [target for target, _ in receiver.calls] == ["doctor", "user"]
    assert receiver.calls[1][1].profile_id == receiver.profile_id
    status = (await doctor_client.get(target)).json()
    assert status["state"] == "active" and status["activated_at"]
    async with sessionmaker() as db:
        assert not await process_next(db, receiver)
        assert await db.scalar(select(func.count()).select_from(ApplicationActivation)) == 1
        assert (
            await db.scalar(
                select(func.count())
                .select_from(ApplicationEvent)
                .where(ApplicationEvent.action == "activation_completed")
            )
            == 1
        )


async def test_partial_failure_retries_same_approval_without_losing_review(
    doctor_client, admin_client, practitioner_payload, sessionmaker
):
    application = await approved(doctor_client, admin_client, practitioner_payload)
    receiver = Receiver(fail="user")
    async with sessionmaker() as db:
        await process_next(db, receiver)
        await db.commit()
    target = f"{BASE}/{application['application_id']}/activation"
    delayed = (await doctor_client.get(target)).json()
    assert delayed["state"] == "retry" and delayed["profile_id"] == str(receiver.profile_id)
    assert (await doctor_client.get(f"{BASE}/{application['application_id']}")).json()[
        "status"
    ] == "approved"
    assert (
        await doctor_client.post(target + "/retry", headers=match(application))
    ).status_code == 403
    assert (
        await admin_client.post(target + "/retry", headers={"If-Match": "1"})
    ).status_code == 412
    assert (
        await admin_client.post(target + "/retry", headers=match(application))
    ).status_code == 200
    receiver.fail = None
    async with sessionmaker() as db:
        await process_next(db, receiver)
        await db.commit()
    assert receiver.calls[0][1] == receiver.calls[2][1]
    assert (await doctor_client.get(target)).json()["state"] == "active"


async def test_nurse_approval_uses_nurse_profile_service(
    doctor_client, admin_client, practitioner_payload, sessionmaker
):
    await approved(
        doctor_client, admin_client, {**practitioner_payload, "practitioner_role": "nurse"}
    )
    receiver = Receiver()
    async with sessionmaker() as db:
        await process_next(db, receiver)
        await db.commit()
    assert [target for target, _ in receiver.calls] == ["nurse", "user"]


async def test_rejection_does_not_queue_activation(
    doctor_client, admin_client, practitioner_payload, sessionmaker
):
    application = await ready(doctor_client, practitioner_payload)
    assert (
        await review(
            admin_client, application, "reject", rejection_reason="License needs correction"
        )
    ).status_code == 200
    async with sessionmaker() as db:
        assert await db.scalar(select(func.count()).select_from(ApplicationActivation)) == 0


async def test_rollback_discards_approval_and_its_activation_job(
    doctor_client,
    practitioner_payload,
    principal_platform_admin,
    sessionmaker,
):
    application = await ready(doctor_client, practitioner_payload)
    async with sessionmaker() as db:
        await review_application(
            db,
            principal_platform_admin,
            UUID(application["application_id"]),
            ApplicationReviewRequest(
                action="approve",
                verified_document_ids=[doc["document_id"] for doc in application["documents"]],
            ),
            application["version"],
        )
        await db.rollback()
    async with sessionmaker() as db:
        assert await db.scalar(select(func.count()).select_from(ApplicationActivation)) == 0
        assert (
            await db.get(PartnerApplication, UUID(application["application_id"]))
        ).status == "submitted"


async def test_withdrawn_approval_never_reaches_activation_receivers(
    doctor_client,
    admin_client,
    practitioner_payload,
    sessionmaker,
):
    application = await approved(doctor_client, admin_client, practitioner_payload)
    async with sessionmaker() as db:
        saved = await db.get(PartnerApplication, UUID(application["application_id"]))
        saved.status = "suspended"
        await db.commit()
    receiver = Receiver()
    async with sessionmaker() as db:
        assert await process_next(db, receiver)
        await db.commit()
        job = await db.scalar(select(ApplicationActivation))
        assert job.state == "attention_required" and job.last_error == "approval_changed"
    assert not receiver.calls


async def test_hospital_activation_checks_account_then_creates_directory_and_workspace(
    hospital_client, admin_client, hospital_team_payload, sessionmaker
):
    application = await approved(hospital_client, admin_client, hospital_team_payload)
    target = f"{BASE}/{application['application_id']}/activation"
    assert (await hospital_client.get(target)).json()["state"] == "pending"
    receiver = HospitalReceiver()
    async with sessionmaker() as db:
        assert await process_next(db, receiver)
        await db.commit()
    assert [target for target, _ in receiver.calls] == ["subject", "hospital", "hms"]
    assert receiver.calls[-1][1].hospital_id == hospital_resource_id(UUID(application["application_id"]))
    result = (await hospital_client.get(target)).json()
    assert result["state"] == "active" and result["activated_at"]


async def test_activation_status_is_owner_or_admin_only(
    doctor_client, hospital_client, admin_client, practitioner_payload
):
    application = await approved(doctor_client, admin_client, practitioner_payload)
    assert (
        await hospital_client.get(f"{BASE}/{application['application_id']}/activation")
    ).status_code == 403


class HospitalReceiver(Receiver):
    async def check_applicant(self, applicant_id):
        self.calls.append(("subject", applicant_id))
        if self.fail == "subject":
            raise ActivationFailure("activation_conflict")

    async def send(self, target, command):
        self.calls.append((target, command))
        if self.fail == target:
            raise ActivationFailure("activation_service_unavailable", True)
        return HospitalActivationResult(application_id=command.application_id, applicant_id=command.applicant_id,
                                        resource_id=hospital_resource_id(command.application_id))


async def test_hospital_partial_failure_reuses_frozen_approval(hospital_client, admin_client, hospital_team_payload, sessionmaker):
    application = await approved(hospital_client, admin_client, hospital_team_payload)
    receiver = HospitalReceiver(fail="hms")
    async with sessionmaker() as db:
        await process_next(db, receiver)
        await db.commit()
    target = f"{BASE}/{application['application_id']}/activation"
    pending = (await hospital_client.get(target)).json()
    assert pending["state"] == "retry" and pending["profile_id"]
    assert (await admin_client.post(target + "/retry", headers=match(application))).status_code == 200
    receiver.fail = None
    async with sessionmaker() as db:
        await process_next(db, receiver)
        await db.commit()
    assert receiver.calls[1][1] == receiver.calls[4][1]
    assert receiver.calls[2][1] == receiver.calls[5][1]
    assert (await hospital_client.get(target)).json()["state"] == "active"


async def test_unavailable_applicant_prevents_organization_writes(hospital_client, admin_client, hospital_team_payload, sessionmaker):
    application = await approved(hospital_client, admin_client, hospital_team_payload)
    receiver = HospitalReceiver(fail="subject")
    async with sessionmaker() as db:
        await process_next(db, receiver)
        await db.commit()
    assert len(receiver.calls) == 1
    result = (await hospital_client.get(f"{BASE}/{application['application_id']}/activation")).json()
    assert result["state"] == "attention_required"


class PharmacyReceiver(HospitalReceiver):
    async def send(self, target, command):
        self.calls.append((target, command))
        if isinstance(command, PharmacyWorkspaceRequest) and self.fail:
            raise ActivationFailure(self.fail, self.fail == "activation_service_unavailable")
        cls = PharmacyWorkspaceResult if isinstance(command, PharmacyWorkspaceRequest) else PharmacyActivationResult
        extra = {"deployment_key": "accra"} if cls is PharmacyWorkspaceResult else {}
        return cls(application_id=command.application_id, applicant_id=command.applicant_id, resource_id=pharmacy_resource_id(command.application_id), **extra)


async def test_pharmacy_approval_queues_directory_and_separate_workspace_without_global_role_change(pharmacist_client, admin_client, pharmacy_payload, sessionmaker):
    application = await approved(pharmacist_client, admin_client, pharmacy_payload)
    target = f"{BASE}/{application['application_id']}/activation"
    assert (await pharmacist_client.get(target)).json()["state"] == "pending"
    receiver = PharmacyReceiver()
    async with sessionmaker() as db:
        assert await process_next(db, receiver)
        await db.commit()
    assert [target for target, _ in receiver.calls] == ["subject", "pharmacy", "pharmacy"]
    assert isinstance(receiver.calls[-1][1], PharmacyWorkspaceRequest)
    assert (await pharmacist_client.get(target)).json()["state"] == "active"


@pytest.mark.parametrize("failure,state", [("workspace_setup_required", "attention_required"), ("activation_service_unavailable", "retry")])
async def test_pharmacy_activation_retries_the_same_snapshot_after_setup(pharmacist_client, admin_client, pharmacy_payload, sessionmaker, failure, state):
    application = await approved(pharmacist_client, admin_client, pharmacy_payload)
    target = f"{BASE}/{application['application_id']}/activation"
    receiver = PharmacyReceiver(fail=failure)
    async with sessionmaker() as db:
        assert await process_next(db, receiver)
        await db.commit()
    pending = (await pharmacist_client.get(target)).json()
    assert pending["state"] == state and pending["profile_id"]
    assert (await admin_client.post(target + "/retry", headers=match(application))).status_code == 200
    receiver.fail = None
    async with sessionmaker() as db:
        assert await process_next(db, receiver)
        await db.commit()
    assert receiver.calls[1][1] == receiver.calls[4][1]
    assert receiver.calls[2][1] == receiver.calls[5][1]
    assert (await pharmacist_client.get(target)).json()["state"] == "active"


async def test_legacy_hospital_job_is_not_reconstructed_implicitly(hospital_client, admin_client, hospital_team_payload, sessionmaker):
    application = await approved(hospital_client, admin_client, hospital_team_payload)
    async with sessionmaker() as db:
        job = await db.scalar(select(ApplicationActivation))
        job.command_json = {}
        job.state = "setup_required"
        await db.commit()
    target = f"{BASE}/{application['application_id']}/activation/retry"
    assert (await admin_client.post(target, headers=match(application))).status_code == 409


@pytest.mark.parametrize("status,retryable", [(503, True), (429, True), (409, False), (401, False)])
async def test_http_receiver_failure_classification(monkeypatch, status, retryable):
    monkeypatch.setattr(settings, "activation_doctor_url", "http://doctor.test")
    monkeypatch.setattr(settings, "activation_doctor_secret", SecretStr("x" * 32))
    command = ProfessionalActivation(
        application_id=uuid4(),
        applicant_id=uuid4(),
        reviewer_id=uuid4(),
        approval_version=5,
        role="doctor",
        first_name="Ama",
        last_name="Mensah",
    )
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(status))
    ) as http:
        with pytest.raises(ActivationFailure) as error:
            await ActivationClient(http).send("doctor", command)
    assert error.value.retryable == retryable


async def test_unconfirmed_response_is_retried(monkeypatch):
    monkeypatch.setattr(settings, "activation_doctor_url", "http://doctor.test")
    monkeypatch.setattr(settings, "activation_doctor_secret", SecretStr("x" * 32))
    command = ProfessionalActivation(
        application_id=uuid4(),
        applicant_id=uuid4(),
        reviewer_id=uuid4(),
        approval_version=5,
        role="doctor",
        first_name="Ama",
        last_name="Mensah",
    )
    seen = []

    def respond(request):
        seen.append(request)
        return httpx.Response(200, json={"role": "admin"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        with pytest.raises(ActivationFailure, match="activation_response_unconfirmed"):
            await ActivationClient(http).send("doctor", command)
    assert len(seen) == 1

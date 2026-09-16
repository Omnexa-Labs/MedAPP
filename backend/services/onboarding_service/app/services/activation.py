import asyncio
import logging
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from fastapi import HTTPException
from shared.onboarding.contracts import ActivationResult, ProfessionalActivation, RoleActivation
from shared.onboarding.organizations import (
    ActivationSubject,
    HospitalActivation,
    HospitalActivationResult,
    HospitalWorkspaceActivation,
    hospital_resource_id,
)
from shared.onboarding.pharmacies import (
    PharmacyActivation,
    PharmacyActivationResult,
    PharmacyWorkspaceRequest,
    PharmacyWorkspaceResult,
    pharmacy_resource_id,
)
from sqlalchemy import select

from ..config import settings
from ..models import ApplicationActivation, ApplicationEvent, PartnerApplication

logger = logging.getLogger(__name__)


def now():
    return datetime.now(UTC)


async def queue_activation(db, application):
    """Called in the approval transaction; never perform remote writes here."""
    existing = await db.scalar(
        select(ApplicationActivation).where(ApplicationActivation.application_id == application.id)
    )
    if existing:
        return existing
    target = (
        application.practitioner_role
        if application.partner_type == "practitioner"
        else application.partner_type
    )
    supported = target in {"doctor", "nurse", "hospital", "pharmacy"}
    command = (
        ProfessionalActivation(
            application_id=application.id,
            applicant_id=application.submitted_by_user_id,
            reviewer_id=application.reviewed_by_user_id,
            approval_version=application.version,
            role=target,
            first_name=application.professional_first_name,
            last_name=application.professional_last_name,
            specialty=application.specialty,
        ).model_dump(mode="json")
        if target in {"doctor", "nurse"}
        else {}
    )
    if target == "hospital":
        command = HospitalActivation(
            application_id=application.id,
            applicant_id=application.submitted_by_user_id,
            reviewer_id=application.reviewed_by_user_id,
            approval_version=application.version,
            name=application.display_name,
            specialty=application.specialty,
            address_line1=application.address_line1,
            city=application.city,
            country=application.country,
            contact_email=application.email,
            contact_phone=application.phone,
            website_url=application.website_url,
        ).model_dump(mode="json")
    if target == "pharmacy":
        command = PharmacyActivation(
            application_id=application.id,
            applicant_id=application.submitted_by_user_id,
            reviewer_id=application.reviewed_by_user_id,
            approval_version=application.version,
            name=application.display_name,
            license_number=application.license_number,
            address_line1=application.address_line1,
            city=application.city,
            country=application.country,
            contact_email=application.email,
            contact_phone=application.phone,
            website_url=application.website_url,
        ).model_dump(mode="json")
    job = ApplicationActivation(
        application_id=application.id,
        approval_version=application.version,
        target=target,
        state="pending" if supported else "setup_required",
        command_json=command,
        attempts=0,
        next_attempt_at=now(),
        last_error=None if supported else "workspace_setup_required",
    )
    db.add(job)
    await db.flush()
    return job


class ActivationFailure(Exception):
    def __init__(self, code, retryable=False):
        self.code = code
        self.retryable = retryable


class ActivationClient:
    def __init__(self, client):
        self.client = client

    def connection(self, target):
        endpoint = getattr(settings, f"activation_{target}_url")
        secret = getattr(settings, f"activation_{target}_secret").get_secret_value()
        try:
            parsed = urlsplit(endpoint)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.query
                or parsed.fragment
                or len(secret) < 32
            ):
                raise ValueError()
        except ValueError as exc:
            raise ActivationFailure("activation_configuration_required") from exc
        return endpoint.rstrip("/"), secret

    async def check_applicant(self, applicant_id):
        endpoint, secret = self.connection("user")
        try:
            response = await self.client.get(
                f"{endpoint}/internal/professional-activations/subjects/{applicant_id}",
                headers={"X-Activation-Secret": secret},
            )
        except httpx.RequestError as exc:
            raise ActivationFailure("activation_service_unavailable", True) from exc
        self.check_response(response)
        try:
            subject = ActivationSubject.model_validate(response.json())
            if subject.applicant_id != applicant_id:
                raise ValueError()
        except ValueError as exc:
            raise ActivationFailure("activation_response_unconfirmed", True) from exc

    @staticmethod
    def check_response(response):
        if response.status_code != 200:
            if response.status_code == 409:
                try:
                    if response.json().get("detail") == "workspace_setup_required":
                        raise ActivationFailure("workspace_setup_required")
                except (ValueError, AttributeError):
                    pass
            transient = response.status_code >= 500 or response.status_code in {408, 429}
            code = (
                "activation_service_unavailable"
                if transient
                else "activation_configuration_required"
                if response.status_code in {401, 403}
                else "activation_conflict"
            )
            raise ActivationFailure(code, transient)

    async def send(self, target, command):
        endpoint, secret = self.connection(target)
        hospital_command = isinstance(command, HospitalActivation)
        route = "hospital-activations" if hospital_command else "professional-activations"
        if isinstance(command, PharmacyWorkspaceRequest):
            route = "pharmacy-workspace-activations"
        elif isinstance(command, PharmacyActivation):
            route = "pharmacy-activations"
        try:
            response = await self.client.post(
                f"{endpoint}/internal/{route}",
                json=command.model_dump(mode="json"),
                headers={"X-Activation-Secret": secret},
            )
        except httpx.RequestError as exc:
            raise ActivationFailure("activation_service_unavailable", True) from exc
        self.check_response(response)
        try:
            result_type = HospitalActivationResult if hospital_command else ActivationResult
            if isinstance(command, PharmacyWorkspaceRequest):
                result_type = PharmacyWorkspaceResult
            elif isinstance(command, PharmacyActivation):
                result_type = PharmacyActivationResult
            result = result_type.model_validate(response.json())
            if (
                result.application_id != command.application_id
                or result.applicant_id != command.applicant_id
                or result.role != command.role
            ):
                raise ValueError()
            if isinstance(command, RoleActivation) and result.resource_id != command.profile_id:
                raise ValueError()
            if hospital_command and result.resource_id != hospital_resource_id(
                command.application_id
            ):
                raise ValueError()
            if isinstance(
                command, PharmacyActivation
            ) and result.resource_id != pharmacy_resource_id(command.application_id):
                raise ValueError()
            return result
        except ValueError as exc:
            # The remote write may have succeeded. Keep the same command for retry.
            raise ActivationFailure("activation_response_unconfirmed", True) from exc


async def process_next(db, client):
    job = await db.scalar(
        select(ApplicationActivation)
        .where(
            ApplicationActivation.state.in_(["pending", "retry"]),
            ApplicationActivation.next_attempt_at <= now(),
        )
        .order_by(ApplicationActivation.next_attempt_at, ApplicationActivation.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if job is None:
        return False
    application = await db.get(PartnerApplication, job.application_id)
    job.attempts += 1
    try:
        if (
            not application
            or application.status != "approved"
            or application.version != job.approval_version
        ):
            raise ActivationFailure("approval_changed")
        command_type = {"hospital": HospitalActivation, "pharmacy": PharmacyActivation}.get(
            job.target, ProfessionalActivation
        )
        command = command_type.model_validate(job.command_json)
        if (
            command.application_id != application.id
            or command.applicant_id != application.submitted_by_user_id
            or command.reviewer_id != application.reviewed_by_user_id
            or command.approval_version != job.approval_version
            or command.role != job.target
        ):
            raise ActivationFailure("approval_changed")
        if isinstance(command, (HospitalActivation, PharmacyActivation)):
            await client.check_applicant(command.applicant_id)
        profile = await client.send(command.role, command)
        job.profile_id = profile.resource_id
        if isinstance(command, HospitalActivation):
            await client.send(
                "hms",
                HospitalWorkspaceActivation(
                    **command.model_dump(), hospital_id=profile.resource_id
                ),
            )
        elif isinstance(command, PharmacyActivation):
            await client.send("pharmacy", PharmacyWorkspaceRequest(**command.model_dump()))
        else:
            await client.send(
                "user", RoleActivation(**command.model_dump(), profile_id=profile.resource_id)
            )
        job.state = "active"
        job.last_error = None
        job.activated_at = now()
    except (ActivationFailure, ValueError) as exc:
        retryable = isinstance(exc, ActivationFailure) and exc.retryable
        job.state = "retry" if retryable else "attention_required"
        job.last_error = (
            exc.code if isinstance(exc, ActivationFailure) else "invalid_activation_snapshot"
        )
        job.next_attempt_at = now() + timedelta(seconds=min(3600, 30 * 2 ** min(job.attempts, 7)))
    if application and application.reviewed_by_user_id:
        db.add(
            ApplicationEvent(
                application_id=application.id,
                actor_id=application.reviewed_by_user_id,
                action="activation_completed" if job.state == "active" else "activation_delayed",
                application_version=job.approval_version,
                details={"state": job.state, "reason": job.last_error, "attempt": job.attempts},
            )
        )
    await db.flush()
    return True


def activation_status(job):
    return {
        "state": job.state if job else "not_started",
        "attempts": job.attempts if job else 0,
        "reason": job.last_error if job else None,
        "profile_id": job.profile_id if job else None,
        "activated_at": job.activated_at if job else None,
    }


async def retry_activation(db, principal, application_id, version):
    from .partner_service import _require_admin, get_application

    _require_admin(principal)
    application = await get_application(db, principal, application_id)
    if application.submitted_by_user_id == UUID(principal.subject):
        raise HTTPException(403, "reviewers cannot activate their own applications")
    if application.version != version:
        raise HTTPException(412, "application changed; reload before retrying activation")
    if application.status != "approved":
        raise HTTPException(409, "only approved applications can be activated")
    job = await db.scalar(
        select(ApplicationActivation)
        .where(ApplicationActivation.application_id == application_id)
        .with_for_update()
    )
    if job is None:
        raise HTTPException(
            409,
            "this legacy approval has no activation record; administrator reconciliation is required",
        )
    if job.state in {"active", "pending"}:
        return job
    if job.target not in {"doctor", "nurse", "hospital", "pharmacy"}:
        raise HTTPException(409, "this workspace requires its deployment provisioning adapter")
    if job.target in {"hospital", "pharmacy"} and not job.command_json:
        raise HTTPException(
            409, "this legacy organization approval requires administrator reconciliation"
        )
    job.state = "pending"
    job.next_attempt_at = now()
    job.last_error = None
    db.add(
        ApplicationEvent(
            application_id=application.id,
            actor_id=UUID(principal.subject),
            action="activation_retried",
            application_version=application.version,
            details={},
        )
    )
    await db.flush()
    return job


async def run_worker(session_factory):
    # Bounded calls, one locked job at a time. A process crash rolls back the job;
    # receiver receipts make the next attempt safe after an uncertain response.
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(15, connect=5), follow_redirects=False, trust_env=False
    ) as http:
        client = ActivationClient(http)
        while True:
            try:
                async with session_factory() as db, db.begin():
                    processed = await process_next(db, client)
                if processed:
                    continue
            except Exception:
                # Avoid request bodies, credentials, DSNs and remote error content in logs.
                logger.error(
                    "professional activation worker could not finish its database transaction"
                )
            await asyncio.sleep(settings.activation_poll_seconds)

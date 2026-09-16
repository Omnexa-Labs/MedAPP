from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models.record import AccessAudit, Consent, PatientRecord, VitalReading
from ..schemas.record import ConsentCreate, ConsentOut, ConsentPage, PatientBundleOut, PatientOut, PatientSummaryOut, VitalCreate, VitalOut
from .clinician_identity import ClinicianLookup


class EHRAccessError(RuntimeError):
    pass


class EHRConflictError(RuntimeError):
    pass


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc


def _is_clinician(principal: Principal) -> bool:
    return principal.role in {"doctor", "nurse", "admin"}


async def _authorize_patient_access(
    session: AsyncSession, principal: Principal, patient: PatientRecord, *, write_vitals: bool = False
) -> tuple[UUID, str]:
    """Return (requester_id, mode).

    `mode` is one of:
      - "self": the patient is reading their own record
      - "consent": a clinician with an active Consent row
      - "admin_override": admin role bypassing both clinician and consent
        checks. Audit finding #5 — this used to be invisible in the audit
        trail; we now tag every admin-override audit row so reviewers can
        spot operator access at a glance (`reason` starts with
        `"[admin_override]"`).
    """
    requester_id = _principal_uuid(principal)
    if requester_id == patient.user_id:
        return requester_id, "self"
    if principal.role == "admin":
        return requester_id, "admin_override"
    if not _is_clinician(principal):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    if not await _has_active_consent(session, patient.id, requester_id, write_vitals=write_vitals):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return requester_id, "consent"


async def create_patient_if_missing(session: AsyncSession, patient_user_id: UUID, *, display_name: str | None = None) -> PatientRecord:
    patient = await session.scalar(select(PatientRecord).where(PatientRecord.user_id == patient_user_id))
    if patient is not None:
        return patient
    patient = PatientRecord(user_id=patient_user_id, display_name=display_name)
    # First access can overlap on multiple workers. Preserve the outer transaction.
    try:
        async with session.begin_nested():
            session.add(patient)
            await session.flush()
    except IntegrityError:
        patient = await session.scalar(select(PatientRecord).where(PatientRecord.user_id == patient_user_id))
        if patient is None:
            raise
    return patient


async def _load_patient(session: AsyncSession, patient_user_id: UUID) -> PatientRecord:
    patient = await session.scalar(select(PatientRecord).where(PatientRecord.user_id == patient_user_id))
    if patient is None:
        patient = await create_patient_if_missing(session, patient_user_id)
    # Grants, revocations and clinical reads/writes share this lock. A request
    # authorized before revocation can finish; later requests see the revocation.
    return await session.scalar(select(PatientRecord).where(PatientRecord.id == patient.id)
                                .with_for_update().execution_options(populate_existing=True))


async def _has_active_consent(session: AsyncSession, patient_id: UUID, doctor_user_id: UUID, *, write_vitals: bool = False) -> bool:
    consent = await session.scalar(
        select(Consent).where(
            Consent.patient_id == patient_id,
            Consent.doctor_user_id == doctor_user_id,
            Consent.scope.in_(["records_and_vitals"] if write_vitals else ["records", "records_and_vitals"]),
            Consent.revoked_at.is_(None),
            or_(Consent.expires_at.is_(None), Consent.expires_at > datetime.now(UTC)),
        )
    )
    return consent is not None


async def record_access(
    session: AsyncSession,
    accessor_user_id: UUID,
    patient_id: UUID,
    resource: str,
    reason: str,
    *,
    mode: str = "self",
) -> None:
    """Write one row to the AccessAudit trail.

    `mode` annotates the reason for compliance review. `admin_override`
    is prefixed loudly so a reviewer running `SELECT * FROM access_audit
    WHERE reason LIKE '[admin_override]%'` can find every operator access
    without scanning the whole table (audit finding #5).
    """
    annotated_reason = (
        f"[admin_override] {reason}" if mode == "admin_override" else reason
    )
    session.add(
        AccessAudit(
            accessor_user_id=accessor_user_id,
            patient_id=patient_id,
            resource=resource,
            reason=annotated_reason,
        )
    )
    await session.flush()


async def get_patient_bundle(session: AsyncSession, principal: Principal, patient_user_id: UUID, *, reason: str = "patient record access") -> PatientBundleOut:
    patient = await _load_patient(session, patient_user_id)

    requester_id, mode = await _authorize_patient_access(session, principal, patient)

    await record_access(session, requester_id, patient.id, "patient_bundle", reason, mode=mode)
    vitals = await list_vitals(session, principal, patient_user_id, reason=reason, enforce_access=False)
    consents = list(
        (
            await session.scalars(
                select(Consent).where(Consent.patient_id == patient.id,
                    True if mode in {"self", "admin_override"} else Consent.doctor_user_id == requester_id
                ).order_by(Consent.granted_at.desc())
            )
        ).all()
    )
    return PatientBundleOut(
        patient=PatientOut.model_validate(patient),
        vitals=[VitalOut.model_validate(vital) for vital in vitals],
        consents=[ConsentOut.model_validate(consent) for consent in consents],
    )


async def get_patient_summary(
    session: AsyncSession,
    principal: Principal,
    patient_user_id: UUID,
    *,
    reason: str = "patient summary access",
) -> PatientSummaryOut:
    patient = await _load_patient(session, patient_user_id)
    requester_id, mode = await _authorize_patient_access(session, principal, patient)

    latest_vitals_result = await session.scalars(
        select(VitalReading)
        .where(VitalReading.patient_id == patient.id)
        .order_by(VitalReading.recorded_at.desc())
        .limit(5)
    )
    latest_vitals = list(latest_vitals_result.all())
    active_consents = list(
        (
            await session.scalars(
                select(Consent)
                .where(Consent.patient_id == patient.id, Consent.revoked_at.is_(None),
                       or_(Consent.expires_at.is_(None), Consent.expires_at > datetime.now(UTC)),
                       True if mode in {"self", "admin_override"} else Consent.doctor_user_id == requester_id)
                .order_by(Consent.granted_at.desc())
            )
        ).all()
    )

    await record_access(session, requester_id, patient.id, "patient_summary", reason, mode=mode)
    return PatientSummaryOut(
        patient=PatientOut.model_validate(patient),
        latest_vitals=[VitalOut.model_validate(vital) for vital in reversed(latest_vitals)],
        active_consents=[ConsentOut.model_validate(consent) for consent in active_consents],
    )


async def record_vital(session: AsyncSession, principal: Principal, patient_user_id: UUID, payload: VitalCreate) -> VitalReading:
    if not _is_clinician(principal):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "clinician access required")
    patient = await _load_patient(session, patient_user_id)
    requester_id, mode = await _authorize_patient_access(session, principal, patient, write_vitals=True)
    vital = VitalReading(
        patient_id=patient.id,
        recorded_by_user_id=_principal_uuid(principal),
        kind=payload.kind,
        value=payload.value,
        unit=payload.unit,
        recorded_at=payload.recorded_at,
        note=payload.note,
    )
    session.add(vital)
    await session.flush()
    await record_access(session, requester_id, patient.id, "vital_write", payload.kind, mode=mode)
    return vital


async def list_vitals(
    session: AsyncSession,
    principal: Principal,
    patient_user_id: UUID,
    *,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    reason: str = "vitals timeline access",
    enforce_access: bool = True,
) -> list[VitalReading]:
    patient = await _load_patient(session, patient_user_id)
    if enforce_access:
        # Centralised authorization — same admin-override tagging as the
        # bundle/summary paths (audit finding #5).
        requester_id, mode = await _authorize_patient_access(session, principal, patient)
    else:
        # Internal callers (e.g. get_patient_bundle) have already authorized
        # and audited; we just need the requester id for downstream use.
        requester_id = _principal_uuid(principal)
        mode = "self"

    stmt = select(VitalReading).where(VitalReading.patient_id == patient.id).order_by(VitalReading.recorded_at.asc())
    if from_date is not None:
        stmt = stmt.where(VitalReading.recorded_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(VitalReading.recorded_at <= to_date)
    result = await session.scalars(stmt)
    vitals = list(result.all())
    if enforce_access:
        await record_access(session, requester_id, patient.id, "vitals_read", reason, mode=mode)
    return vitals


async def create_consent(session: AsyncSession, principal: Principal, patient_user_id: UUID, payload: ConsentCreate, *, lookup: ClinicianLookup) -> Consent:
    requester_id = _principal_uuid(principal)
    if requester_id != patient_user_id and principal.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "patients can only manage their own consents")
    if patient_user_id == payload.doctor_user_id:
        raise HTTPException(400, "you already have access to your own records")
    clinician = await lookup(payload.doctor_user_id)
    patient = await _load_patient(session, patient_user_id)
    existing = list((await session.scalars(
        select(Consent).where(
            Consent.patient_id == patient.id,
            Consent.doctor_user_id == payload.doctor_user_id,
            Consent.revoked_at.is_(None),
        )
    )).all())
    now = datetime.now(UTC)
    for previous in existing:
        expiry = previous.expires_at
        if expiry and not expiry.tzinfo:
            expiry = expiry.replace(tzinfo=UTC)
        if expiry and expiry <= now:
            previous.revoked_at = expiry
            previous.revoked_by_user_id = None
        elif previous.scope in {"records", "records_and_vitals"} or previous.scope == payload.scope:
            raise HTTPException(409, "active sharing already exists; revoke it before changing permissions")
    await session.flush()
    consent = Consent(
        patient_id=patient.id,
        doctor_user_id=payload.doctor_user_id,
        scope=payload.scope,
        granted_by_user_id=requester_id,
        granted_at=now,
        expires_at=now + timedelta(days=payload.expires_in_days),
        clinician_display_name=clinician.display_name,
        clinician_role=clinician.role,
        reason=payload.reason,
    )
    session.add(consent)
    await session.flush()
    await record_access(session, requester_id, patient.id, "consent_write",
                        f"{consent.id}; {payload.scope}; {payload.expires_in_days} days",
                        mode="self" if requester_id == patient_user_id else "admin_override")
    return consent


async def delete_consent(session: AsyncSession, principal: Principal, patient_user_id: UUID, consent_id: UUID) -> Consent:
    requester_id = _principal_uuid(principal)
    if requester_id != patient_user_id and principal.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "patients can only manage their own consents")
    patient = await _load_patient(session, patient_user_id)
    consent = await session.scalar(select(Consent).where(Consent.id == consent_id)
                                    .execution_options(populate_existing=True))
    if consent is None or consent.patient_id != patient.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "consent not found")
    if consent.revoked_at is not None:
        return consent
    consent.revoked_at = datetime.now(tz=UTC)
    consent.revoked_by_user_id = requester_id
    await session.flush()
    await record_access(session, requester_id, patient.id, "consent_revoke", str(consent.id),
                        mode="self" if requester_id == patient_user_id else "admin_override")
    return consent


async def list_consents(session: AsyncSession, principal: Principal, patient_user_id: UUID,
                        *, include_inactive: bool = False, limit: int = 25, offset: int = 0,
                        clinician_user_id: UUID | None = None) -> ConsentPage:
    requester_id = _principal_uuid(principal)
    if requester_id != patient_user_id and principal.role != "admin":
        raise HTTPException(403, "patients can only manage their own consents")
    patient = await _load_patient(session, patient_user_id)
    statement = select(Consent).where(Consent.patient_id == patient.id)
    if clinician_user_id:
        statement = statement.where(Consent.doctor_user_id == clinician_user_id)
    if not include_inactive:
        statement = statement.where(Consent.revoked_at.is_(None),
            or_(Consent.expires_at.is_(None), Consent.expires_at > datetime.now(UTC)))
    rows = list((await session.scalars(statement.order_by(Consent.granted_at.desc(), Consent.id.desc())
                                      .offset(offset).limit(limit + 1))).all())
    await record_access(session, requester_id, patient.id, "consent_list", "sharing settings",
                        mode="self" if requester_id == patient_user_id else "admin_override")
    return ConsentPage(items=[ConsentOut.model_validate(row) for row in rows[:limit]],
                       offset=offset, limit=limit, next_offset=offset + limit if len(rows) > limit else None)

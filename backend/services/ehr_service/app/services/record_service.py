from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models.record import AccessAudit, Consent, PatientRecord, VitalReading
from ..schemas.record import ConsentCreate, ConsentOut, PatientBundleOut, PatientOut, PatientSummaryOut, VitalCreate, VitalOut


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


async def _authorize_patient_access(session: AsyncSession, principal: Principal, patient: PatientRecord) -> UUID:
    requester_id = _principal_uuid(principal)
    if requester_id != patient.user_id:
        if principal.role != "admin" and not _is_clinician(principal):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
        if principal.role != "admin" and not await _has_active_consent(session, patient.id, requester_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return requester_id


async def create_patient_if_missing(session: AsyncSession, patient_user_id: UUID, *, display_name: str | None = None) -> PatientRecord:
    patient = await session.scalar(select(PatientRecord).where(PatientRecord.user_id == patient_user_id))
    if patient is not None:
        return patient
    patient = PatientRecord(user_id=patient_user_id, display_name=display_name)
    session.add(patient)
    await session.flush()
    return patient


async def _load_patient(session: AsyncSession, patient_user_id: UUID) -> PatientRecord:
    patient = await session.scalar(select(PatientRecord).where(PatientRecord.user_id == patient_user_id))
    if patient is None:
        patient = await create_patient_if_missing(session, patient_user_id)
    return patient


async def _has_active_consent(session: AsyncSession, patient_id: UUID, doctor_user_id: UUID) -> bool:
    consent = await session.scalar(
        select(Consent).where(
            Consent.patient_id == patient_id,
            Consent.doctor_user_id == doctor_user_id,
            Consent.scope == "records",
            Consent.revoked_at.is_(None),
        )
    )
    return consent is not None


async def record_access(session: AsyncSession, accessor_user_id: UUID, patient_id: UUID, resource: str, reason: str) -> None:
    session.add(AccessAudit(accessor_user_id=accessor_user_id, patient_id=patient_id, resource=resource, reason=reason))
    await session.flush()


async def get_patient_bundle(session: AsyncSession, principal: Principal, patient_user_id: UUID, *, reason: str = "patient record access") -> PatientBundleOut:
    patient = await _load_patient(session, patient_user_id)

    requester_id = await _authorize_patient_access(session, principal, patient)

    await record_access(session, requester_id, patient.id, "patient_bundle", reason)
    vitals = await list_vitals(session, principal, patient_user_id, reason=reason, enforce_access=False)
    consents = list(
        (
            await session.scalars(
                select(Consent).where(Consent.patient_id == patient.id).order_by(Consent.granted_at.desc())
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
    requester_id = await _authorize_patient_access(session, principal, patient)

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
                .where(Consent.patient_id == patient.id, Consent.revoked_at.is_(None))
                .order_by(Consent.granted_at.desc())
            )
        ).all()
    )

    await record_access(session, requester_id, patient.id, "patient_summary", reason)
    return PatientSummaryOut(
        patient=PatientOut.model_validate(patient),
        latest_vitals=[VitalOut.model_validate(vital) for vital in reversed(latest_vitals)],
        active_consents=[ConsentOut.model_validate(consent) for consent in active_consents],
    )


async def record_vital(session: AsyncSession, principal: Principal, patient_user_id: UUID, payload: VitalCreate) -> VitalReading:
    if not _is_clinician(principal):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "clinician access required")
    patient = await _load_patient(session, patient_user_id)
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
    await record_access(session, _principal_uuid(principal), patient.id, "vital_write", payload.kind)
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
    requester_id = _principal_uuid(principal)
    patient = await _load_patient(session, patient_user_id)
    if enforce_access and requester_id != patient.user_id:
        if principal.role != "admin" and not _is_clinician(principal):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
        if principal.role != "admin" and not await _has_active_consent(session, patient.id, requester_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")

    stmt = select(VitalReading).where(VitalReading.patient_id == patient.id).order_by(VitalReading.recorded_at.asc())
    if from_date is not None:
        stmt = stmt.where(VitalReading.recorded_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(VitalReading.recorded_at <= to_date)
    result = await session.scalars(stmt)
    vitals = list(result.all())
    if enforce_access:
        await record_access(session, requester_id, patient.id, "vitals_read", reason)
    return vitals


async def create_consent(session: AsyncSession, principal: Principal, patient_user_id: UUID, payload: ConsentCreate) -> Consent:
    requester_id = _principal_uuid(principal)
    if requester_id != patient_user_id and principal.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "patients can only manage their own consents")
    patient = await _load_patient(session, patient_user_id)
    existing = await session.scalar(
        select(Consent).where(
            Consent.patient_id == patient.id,
            Consent.doctor_user_id == payload.doctor_user_id,
            Consent.scope == payload.scope,
            Consent.revoked_at.is_(None),
        )
    )
    if existing is not None:
        raise EHRConflictError("active consent already exists")
    consent = Consent(
        patient_id=patient.id,
        doctor_user_id=payload.doctor_user_id,
        scope=payload.scope,
        granted_by_user_id=requester_id,
        granted_at=datetime.now(tz=UTC),
    )
    session.add(consent)
    await session.flush()
    await record_access(session, requester_id, patient.id, "consent_write", payload.reason)
    return consent


async def delete_consent(session: AsyncSession, principal: Principal, patient_user_id: UUID, consent_id: UUID) -> Consent:
    requester_id = _principal_uuid(principal)
    if requester_id != patient_user_id and principal.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "patients can only manage their own consents")
    patient = await _load_patient(session, patient_user_id)
    consent = await session.get(Consent, consent_id)
    if consent is None or consent.patient_id != patient.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "consent not found")
    consent.revoked_at = datetime.now(tz=UTC)
    consent.revoked_by_user_id = requester_id
    await session.flush()
    await record_access(session, requester_id, patient.id, "consent_revoke", "patient revocation")
    return consent
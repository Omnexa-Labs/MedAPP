from __future__ import annotations

from datetime import timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models import LabOrder, LabResult
from ..schemas.lab import LabOrderCreate, LabResultUpload


class LabError(ValueError):
    pass


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _ensure_role(principal: Principal, allowed_roles: set[str], message: str) -> None:
    if principal.role not in allowed_roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, message)


def _can_access_result(principal: Principal, result: LabResult) -> None:
    if principal.role == "admin":
        return
    if result.patient_id == _principal_uuid(principal):
        return
    if principal.role == "doctor":
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only access your own lab results")


async def create_lab_order(db: AsyncSession, principal: Principal, payload: LabOrderCreate) -> LabOrder:
    _ensure_role(principal, {"doctor", "admin"}, "doctor access required")
    if payload.due_at is not None and payload.due_at.tzinfo is None:
        raise LabError("due_at must be timezone-aware")

    order = LabOrder(
        patient_id=payload.patient_id,
        ordered_by_user_id=_principal_uuid(principal),
        test_name=payload.test_name.strip(),
        priority=payload.priority.strip() or "routine",
        instructions=_normalize_text(payload.instructions),
        due_at=payload.due_at,
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)
    return order


async def upload_lab_result(db: AsyncSession, principal: Principal, payload: LabResultUpload) -> LabResult:
    uploader_id = _principal_uuid(principal)
    patient_id = payload.patient_id
    order: LabOrder | None = None

    if payload.lab_order_id is not None:
        order = await db.get(LabOrder, payload.lab_order_id)
        if order is None:
            raise LabError("lab order not found")
        if patient_id is not None and patient_id != order.patient_id:
            raise LabError("patient_id does not match the lab order")
        patient_id = order.patient_id

    if patient_id is None:
        raise LabError("patient_id is required")

    if principal.role == "patient" and patient_id != uploader_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "patients can only upload their own results")

    _ensure_role(principal, {"patient", "doctor", "admin", "lab_partner"}, "lab upload access required")

    result = LabResult(
        patient_id=patient_id,
        lab_order_id=payload.lab_order_id if order is not None else payload.lab_order_id,
        uploaded_by_user_id=uploader_id,
        source=payload.source.strip() or "patient_upload",
        title=payload.title.strip(),
        summary=_normalize_text(payload.summary),
        file_name=_normalize_text(payload.file_name),
        mime_type=_normalize_text(payload.mime_type),
        storage_key=_normalize_text(payload.storage_key),
        external_url=_normalize_text(payload.external_url),
        resulted_at=payload.resulted_at,
        raw_text=_normalize_text(payload.raw_text),
        parsed_values=payload.parsed_values,
    )
    db.add(result)
    await db.flush()
    await db.refresh(result)
    return result


async def get_lab_result(db: AsyncSession, principal: Principal, result_id: UUID) -> LabResult:
    result = await db.get(LabResult, result_id)
    if result is None:
        raise LabError("lab result not found")
    _can_access_result(principal, result)
    return result


async def list_my_results(db: AsyncSession, principal: Principal) -> list[LabResult]:
    patient_id = _principal_uuid(principal)
    stmt = select(LabResult).where(LabResult.patient_id == patient_id).order_by(LabResult.resulted_at.desc().nullslast(), LabResult.created_at.desc())
    result = await db.scalars(stmt)
    return list(result.all())
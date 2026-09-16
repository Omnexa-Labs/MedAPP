"""Patient/consented-clinician timeline with stable paging for equal timestamps."""
import base64
import binascii
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal
from ..models.record import VitalReading
from ..schemas.record import VitalOut, VitalTimelineOut
from .record_service import _authorize_patient_access, _load_patient, record_access


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def cursor_for(row: VitalReading) -> str:
    value = f"{utc(row.recorded_at).isoformat()}|{row.id}"
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")


def read_cursor(value: str) -> tuple[datetime, UUID]:
    try:
        decoded = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True).decode()
        timestamp, identifier = decoded.split("|")
        at = datetime.fromisoformat(timestamp)
        if at.tzinfo is None:
            raise ValueError("cursor must carry an offset")
        return utc(at), UUID(identifier)
    except (ValueError, UnicodeError, binascii.Error) as exc:
        raise HTTPException(422, "invalid timeline cursor") from exc


async def list_vital_page(session: AsyncSession, principal: Principal, patient_user_id: UUID,
                          *, limit: int, cursor: str | None = None, kind: str | None = None,
                          from_date: datetime | None = None, to_date: datetime | None = None) -> VitalTimelineOut:
    if from_date and to_date and utc(from_date) > utc(to_date):
        raise HTTPException(422, "from_date must not be after to_date")
    before = read_cursor(cursor) if cursor else None
    patient = await _load_patient(session, patient_user_id)
    requester, mode = await _authorize_patient_access(session, principal, patient)
    statement = select(VitalReading).where(VitalReading.patient_id == patient.id)
    if kind:
        statement = statement.where(func.replace(VitalReading.kind, "_", " ").icontains(kind.replace("_", " "), autoescape=True))
    if from_date:
        statement = statement.where(VitalReading.recorded_at >= utc(from_date))
    if to_date:
        statement = statement.where(VitalReading.recorded_at <= utc(to_date))
    if before:
        at, identifier = before
        statement = statement.where(or_(VitalReading.recorded_at < at,
            and_(VitalReading.recorded_at == at, VitalReading.id < identifier)))
    rows = list((await session.scalars(statement.order_by(VitalReading.recorded_at.desc(), VitalReading.id.desc()).limit(limit + 1))).all())
    await record_access(session, requester, patient.id, "vitals_read", "paged vital timeline", mode=mode)
    return VitalTimelineOut(items=[VitalOut.model_validate(row) for row in rows[:limit]],
        next_cursor=cursor_for(rows[limit - 1]) if len(rows) > limit else None)

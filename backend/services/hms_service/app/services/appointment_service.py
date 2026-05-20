from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.appointment import Appointment, QueueEntry
from ..schemas.appointment import AppointmentCreate, AppointmentUpdate, QueueEntryCreate, QueueEntryUpdate


async def create_appointment(body: AppointmentCreate, db: AsyncSession) -> Appointment:
    appt = Appointment(
        patient_id=body.patient_id,
        doctor_staff_id=body.doctor_staff_id,
        department_id=body.department_id,
        appointment_type=body.appointment_type,
        scheduled_date=body.scheduled_date,
        scheduled_start=body.scheduled_start,
        scheduled_end=body.scheduled_end,
        reason=body.reason,
        notes=body.notes,
    )
    db.add(appt)
    await db.flush()
    return appt


async def list_appointments(
    db: AsyncSession,
    scheduled_date: date | None = None,
    doctor_staff_id: UUID | None = None,
    patient_id: UUID | None = None,
    status: str | None = None,
) -> list[Appointment]:
    query = select(Appointment)
    if scheduled_date:
        query = query.where(Appointment.scheduled_date == scheduled_date)
    if doctor_staff_id:
        query = query.where(Appointment.doctor_staff_id == doctor_staff_id)
    if patient_id:
        query = query.where(Appointment.patient_id == patient_id)
    if status:
        query = query.where(Appointment.status == status)
    result = await db.execute(query.order_by(Appointment.scheduled_date, Appointment.scheduled_start))
    return list(result.scalars().all())


async def get_appointment(appt_id: UUID, db: AsyncSession) -> Appointment | None:
    result = await db.execute(select(Appointment).where(Appointment.id == appt_id))
    return result.scalar_one_or_none()


async def update_appointment(appt_id: UUID, body: AppointmentUpdate, db: AsyncSession) -> Appointment | None:
    appt = await get_appointment(appt_id, db)
    if appt is None:
        return None
    update_data = body.model_dump(exclude_unset=True)
    if update_data.get("status") == "cancelled":
        update_data["cancelled_at"] = datetime.now(tz=timezone.utc)
    for key, value in update_data.items():
        setattr(appt, key, value)
    await db.flush()
    return appt


async def _next_ticket_number(department_id: UUID | None, db: AsyncSession) -> str:
    today_start = datetime.now(tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    query = select(func.count(QueueEntry.id)).where(QueueEntry.joined_at >= today_start)
    if department_id:
        query = query.where(QueueEntry.department_id == department_id)
    result = await db.execute(query)
    count = result.scalar_one() + 1
    prefix = "A" if department_id is None else "Q"
    return f"{prefix}{count:03d}"


async def add_to_queue(body: QueueEntryCreate, db: AsyncSession) -> QueueEntry:
    ticket = await _next_ticket_number(body.department_id, db)
    entry = QueueEntry(
        patient_id=body.patient_id,
        visit_id=body.visit_id,
        department_id=body.department_id,
        assigned_staff_id=body.assigned_staff_id,
        queue_type=body.queue_type,
        priority=body.priority,
        ticket_number=ticket,
        joined_at=datetime.now(tz=timezone.utc),
    )
    db.add(entry)
    await db.flush()
    return entry


async def list_queue(
    db: AsyncSession,
    department_id: UUID | None = None,
    status: str | None = None,
) -> list[QueueEntry]:
    query = select(QueueEntry)
    if department_id:
        query = query.where(QueueEntry.department_id == department_id)
    if status:
        query = query.where(QueueEntry.status == status)
    else:
        query = query.where(QueueEntry.status.in_(["waiting", "called", "serving"]))
    result = await db.execute(query.order_by(QueueEntry.priority, QueueEntry.joined_at))
    return list(result.scalars().all())


async def update_queue_entry(entry_id: UUID, body: QueueEntryUpdate, db: AsyncSession) -> QueueEntry | None:
    result = await db.execute(select(QueueEntry).where(QueueEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if entry is None:
        return None
    now = datetime.now(tz=timezone.utc)
    if body.status == "called" and entry.called_at is None:
        entry.called_at = now
    elif body.status in ("completed", "skipped"):
        entry.completed_at = now
    if body.status:
        entry.status = body.status
    if body.assigned_staff_id:
        entry.assigned_staff_id = body.assigned_staff_id
    await db.flush()
    return entry


async def get_queue_stats(db: AsyncSession) -> dict:
    waiting_result = await db.execute(
        select(func.count(QueueEntry.id)).where(QueueEntry.status == "waiting")
    )
    serving_result = await db.execute(
        select(func.count(QueueEntry.id)).where(QueueEntry.status == "serving")
    )
    return {
        "total_waiting": waiting_result.scalar_one(),
        "total_serving": serving_result.scalar_one(),
        "avg_wait_minutes": 0.0,
        "by_department": {},
    }

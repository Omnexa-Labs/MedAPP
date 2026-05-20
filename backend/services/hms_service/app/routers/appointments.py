from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import HmsPrincipal, get_tenant_db, require_hms_roles
from ..schemas.appointment import (
    AppointmentCreate,
    AppointmentList,
    AppointmentOut,
    AppointmentUpdate,
    QueueEntryCreate,
    QueueEntryList,
    QueueEntryOut,
    QueueEntryUpdate,
    QueueStatsOut,
)
from ..services import appointment_service

router = APIRouter(prefix="/v1", tags=["appointments"])

BOOKING_ROLES = ("hospital_admin", "receptionist", "doctor", "nurse")


@router.post("/appointments", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
async def book_appointment(
    body: AppointmentCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BOOKING_ROLES)),
):
    appt = await appointment_service.create_appointment(body, db)
    return appt


@router.get("/appointments", response_model=AppointmentList)
async def list_appointments(
    scheduled_date: date | None = Query(default=None),
    doctor_staff_id: UUID | None = Query(default=None),
    patient_id: UUID | None = Query(default=None),
    appt_status: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BOOKING_ROLES)),
):
    appts = await appointment_service.list_appointments(
        db, scheduled_date, doctor_staff_id, patient_id, appt_status
    )
    return AppointmentList(items=appts)


@router.get("/appointments/{appt_id}", response_model=AppointmentOut)
async def get_appointment(
    appt_id: UUID,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BOOKING_ROLES)),
):
    appt = await appointment_service.get_appointment(appt_id, db)
    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "appointment not found")
    return appt


@router.patch("/appointments/{appt_id}", response_model=AppointmentOut)
async def update_appointment(
    appt_id: UUID,
    body: AppointmentUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BOOKING_ROLES)),
):
    appt = await appointment_service.update_appointment(appt_id, body, db)
    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "appointment not found")
    return appt


@router.post("/queue", response_model=QueueEntryOut, status_code=status.HTTP_201_CREATED)
async def add_to_queue(
    body: QueueEntryCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BOOKING_ROLES)),
):
    entry = await appointment_service.add_to_queue(body, db)
    return entry


@router.get("/queue", response_model=QueueEntryList)
async def list_queue(
    department_id: UUID | None = Query(default=None),
    queue_status: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BOOKING_ROLES)),
):
    entries = await appointment_service.list_queue(db, department_id, queue_status)
    return QueueEntryList(items=entries)


@router.patch("/queue/{entry_id}", response_model=QueueEntryOut)
async def update_queue_entry(
    entry_id: UUID,
    body: QueueEntryUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BOOKING_ROLES)),
):
    entry = await appointment_service.update_queue_entry(entry_id, body, db)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "queue entry not found")
    return entry


@router.get("/queue/stats", response_model=QueueStatsOut)
async def queue_stats(
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BOOKING_ROLES)),
):
    stats = await appointment_service.get_queue_stats(db)
    return QueueStatsOut(**stats)

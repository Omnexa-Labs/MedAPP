from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select

from ..deps import CurrentPrincipalDep, DbSession
from ..models.medication import MedicationDose as Dose
from ..models.medication import MedicationEvent as Event
from ..schemas.medication import (
    CourseChange,
    CourseCreate,
    CourseOut,
    CoursePage,
    DoseChange,
    DoseCreate,
    DoseOut,
    DosePage,
    EventPage,
    ReminderChange,
    ScheduleChange,
    TrackingPage,
)
from ..services import medications as service
from ..services.record_service import record_access
from .prescriptions import private_response

router = APIRouter(
    prefix="/v1/patients/{patient_id}/medications",
    tags=["medication tracking"],
    dependencies=[Depends(private_response)],
)
RequestKey = Header()


@router.get("", response_model=CoursePage)
async def index(
    patient_id: UUID,
    status: Literal["all", "active", "paused", "stopped", "completed"] = "all",
    limit: int = Query(25, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db=DbSession,
    principal=CurrentPrincipalDep,
):
    patient = await service.owner(db, principal, patient_id)
    query = service.selection(patient)
    if status != "all":
        query = query.where(service.Course.status == status)
    rows = (
        await db.execute(
            query.order_by(service.Course.created_at.desc(), service.Course.id.desc())
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    await record_access(db, patient_id, patient.id, "medication_list", "patient medication history")
    return {
        "items": [service.output(patient, course, rx) for course, rx in rows[:limit]],
        "offset": offset,
        "limit": limit,
        "next_offset": offset + limit if len(rows) > limit else None,
    }


@router.get("/tracker", response_model=TrackingPage)
async def tracker(
    patient_id: UUID,
    day: date,
    limit: int = Query(25, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db=DbSession,
    principal=CurrentPrincipalDep,
):
    patient = await service.owner(db, principal, patient_id)
    result = await service.tracking(db, patient, day, limit, offset)
    await record_access(db, patient_id, patient.id, "medication_tracker", day.isoformat())
    return result


@router.post("", response_model=CourseOut, status_code=201)
async def create(
    patient_id: UUID,
    payload: CourseCreate,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
):
    patient = await service.owner(db, principal, patient_id)
    return await service.create(db, patient, payload, idempotency_key)


@router.get("/{course_id}", response_model=CourseOut)
async def detail(patient_id: UUID, course_id: UUID, db=DbSession, principal=CurrentPrincipalDep):
    patient = await service.owner(db, principal, patient_id)
    course, rx = await service.load(db, patient, course_id)
    await record_access(db, patient_id, patient.id, "medication_read", str(course.id))
    return service.output(patient, course, rx)


@router.post("/{course_id}/status", response_model=CourseOut)
async def change(
    patient_id: UUID,
    course_id: UUID,
    payload: CourseChange,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
):
    patient = await service.owner(db, principal, patient_id)
    return await service.change(db, patient, course_id, payload, idempotency_key)


@router.post("/{course_id}/schedule", response_model=CourseOut)
async def revise_schedule(
    patient_id: UUID,
    course_id: UUID,
    payload: ScheduleChange,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
):
    patient = await service.owner(db, principal, patient_id)
    return await service.revise_schedule(db, patient, course_id, payload, idempotency_key)


@router.post("/{course_id}/reminders", response_model=CourseOut)
async def change_reminders(
    patient_id: UUID,
    course_id: UUID,
    payload: ReminderChange,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
):
    patient = await service.owner(db, principal, patient_id)
    return await service.change_reminders(db, patient, course_id, payload, idempotency_key)


@router.get("/{course_id}/doses", response_model=DosePage)
async def doses(
    patient_id: UUID,
    course_id: UUID,
    limit: int = Query(25, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db=DbSession,
    principal=CurrentPrincipalDep,
):
    patient = await service.owner(db, principal, patient_id)
    await service.load(db, patient, course_id)
    entries = list(
        await db.scalars(
            select(Dose)
            .where(Dose.course_id == course_id)
            .order_by(Dose.day.desc(), Dose.created_at.desc(), Dose.id.desc())
            .offset(offset)
            .limit(limit + 1)
        )
    )
    await record_access(db, patient_id, patient.id, "medication_doses", str(course_id))
    return {
        "items": [service.dose_output(patient, entry) for entry in entries[:limit]],
        "offset": offset,
        "limit": limit,
        "next_offset": offset + limit if len(entries) > limit else None,
    }


@router.post("/{course_id}/doses", response_model=DoseOut, status_code=201)
async def record_dose(
    patient_id: UUID,
    course_id: UUID,
    payload: DoseCreate,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
):
    patient = await service.owner(db, principal, patient_id)
    return await service.record_dose(db, patient, course_id, payload, idempotency_key)


@router.post("/{course_id}/doses/{dose_id}/correct", response_model=DoseOut)
async def correct_dose(
    patient_id: UUID,
    course_id: UUID,
    dose_id: UUID,
    payload: DoseChange,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
):
    patient = await service.owner(db, principal, patient_id)
    return await service.correct_dose(db, patient, course_id, dose_id, payload, idempotency_key)


@router.get("/{course_id}/events", response_model=EventPage)
async def events(
    patient_id: UUID,
    course_id: UUID,
    limit: int = Query(25, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db=DbSession,
    principal=CurrentPrincipalDep,
):
    patient = await service.owner(db, principal, patient_id)
    await service.load(db, patient, course_id)
    rows = list(
        await db.scalars(
            select(Event)
            .where(Event.course_id == course_id)
            .order_by(Event.created_at.desc(), Event.id.desc())
            .offset(offset)
            .limit(limit + 1)
        )
    )
    await record_access(db, patient_id, patient.id, "medication_events", str(course_id))
    return {
        "items": [
            {
                "id": entry.id,
                "kind": entry.kind,
                "payload": entry.payload,
                "recorded_at": service.aware(entry.created_at),
            }
            for entry in rows[:limit]
        ],
        "offset": offset,
        "limit": limit,
        "next_offset": offset + limit if len(rows) > limit else None,
    }

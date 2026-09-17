"""Patient-reported courses and adherence; never alters prescribing or dispensing."""

import hashlib
import json
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..models.medication import MedicationCourse as Course
from ..models.medication import MedicationDose as Dose
from ..models.medication import MedicationEvent as Event
from ..models.medication import MedicationRequest as Request
from ..models.prescription import ClinicalPrescription as Rx
from ..schemas.medication import CourseOut, DoseOut, Medicine, TrackingCourse, TrackingSlot
from .record_service import _load_patient, _principal_uuid, record_access


def now():
    return datetime.now(UTC)


def aware(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


async def owner(db, principal, patient_id):
    if _principal_uuid(principal) != patient_id:
        raise HTTPException(403, "medication tracking is private to its patient")
    return await _load_patient(db, patient_id)


def selection(patient):
    return (
        select(Course, Rx)
        .outerjoin(Rx, Rx.id == Course.prescription_id)
        .where(Course.patient_id == patient.id)
    )


async def load(db, patient, course_id):
    row = (await db.execute(selection(patient).where(Course.id == course_id))).first()
    if row is None:
        raise HTTPException(404, "medication course not found")
    return row


def plan_on(course, day):
    """Original plan remains immutable; future revisions never rewrite past slots."""
    plan = {"daily_times": course.daily_times, "end_date": course.end_date}
    for revision in sorted(course.schedule_changes or [], key=lambda item: item["effective_date"]):
        if revision["effective_date"] <= day.isoformat():
            plan = {
                "daily_times": revision["daily_times"],
                "end_date": date.fromisoformat(revision["end_date"])
                if revision["end_date"]
                else None,
            }
    return plan


def output(patient, course, rx, day=None):
    plan = plan_on(course, day or now().astimezone(ZoneInfo(course.timezone)).date())
    return CourseOut(
        id=course.id,
        patient_user_id=patient.user_id,
        source=course.source,
        prescription_id=course.prescription_id,
        prescription_item=course.prescription_item,
        prescription_status=rx.status if rx else None,
        prescriber_name=rx.prescriber_name if rx else None,
        medicine=course.medicine,
        status=course.status,
        version=course.version,
        start_date=course.start_date,
        end_date=plan["end_date"],
        timezone=course.timezone,
        daily_times=plan["daily_times"],
        schedule_changes=course.schedule_changes or [],
        reminders_enabled=course.reminders_enabled,
        created_at=aware(course.created_at),
    )


def dose_output(patient, dose):
    return DoseOut(
        id=dose.id,
        patient_user_id=patient.user_id,
        course_id=dose.course_id,
        day=dose.day,
        time=dose.time,
        scheduled_at=aware(dose.scheduled_at) if dose.scheduled_at else None,
        occurred_at=aware(dose.occurred_at) if dose.occurred_at else None,
        outcome=dose.outcome,
        note=dose.note,
        version=dose.version,
        reported_at=aware(dose.created_at),
    )


def event(db, course, kind, payload):
    db.add(Event(course_id=course.id, kind=kind, payload=payload))


async def begin(db, patient, key, operation, resource_id, payload):
    digest = hashlib.sha256(
        json.dumps(
            [str(patient.user_id), operation, str(resource_id), payload.model_dump(mode="json")],
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    insert = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
    inserted = await db.scalar(
        insert(Request)
        .values(id=key, actor_id=patient.user_id, request_hash=digest)
        .on_conflict_do_nothing(index_elements=[Request.id])
        .returning(Request.id)
    )
    if inserted:
        return None
    receipt = await db.get(Request, key)
    if (
        receipt.actor_id != patient.user_id
        or receipt.request_hash != digest
        or receipt.response is None
    ):
        raise HTTPException(409, "request reference conflicts; reload the saved record")
    return receipt.response


async def finish(db, patient, key, operation, course, result):
    await record_access(db, patient.user_id, patient.id, f"medication_{operation}", str(course.id))
    receipt = await db.get(Request, key)
    receipt.response = result.model_dump(mode="json")
    await db.commit()
    return receipt.response


def check_version(record, version):
    if record.version != version:
        raise HTTPException(409, "record changed; reload before continuing")


async def create(db, patient, payload, key):
    previous = await begin(db, patient, key, "create", None, payload)
    if previous is not None:
        return previous
    today = now().astimezone(ZoneInfo(payload.timezone)).date()
    if not today - timedelta(days=3650) <= payload.start_date <= today + timedelta(days=365):
        raise HTTPException(422, "start date is outside the supported tracking range")
    if payload.end_date and payload.end_date > payload.start_date + timedelta(days=3650):
        raise HTTPException(422, "tracking end date is too far from the start date")
    rx = None
    if payload.prescription_id:
        rx = await db.scalar(
            select(Rx).where(
                Rx.id == payload.prescription_id,
                Rx.patient_id == patient.id,
                Rx.status == "issued",
                Rx.issued_at.is_not(None),
            )
        )
        if rx is None:
            raise HTTPException(404, "issued prescription not found")
        if payload.prescription_item >= len(rx.items):
            raise HTTPException(422, "prescription item not found")
        if await db.scalar(
            select(Course.id).where(
                Course.prescription_id == rx.id,
                Course.prescription_item == payload.prescription_item,
            )
        ):
            raise HTTPException(409, "this prescribed medicine already has a tracking record")
        if payload.start_date < aware(rx.issued_at).astimezone(ZoneInfo(payload.timezone)).date():
            raise HTTPException(422, "tracking cannot begin before this prescription was issued")
        medicine = {k: v for k, v in rx.items[payload.prescription_item].items() if k != "quantity"}
        medicine = Medicine.model_validate(medicine)
    else:
        medicine = payload.medicine
    course = Course(
        patient_id=patient.id,
        prescription_id=payload.prescription_id,
        prescription_item=payload.prescription_item,
        source="prescribed" if rx else "self_reported",
        medicine=medicine.model_dump(),
        start_date=payload.start_date,
        end_date=payload.end_date,
        timezone=payload.timezone,
        daily_times=payload.daily_times,
    )
    db.add(course)
    await db.flush()
    event(
        db,
        course,
        "created",
        {
            "status": "active",
            "source": course.source,
            "start_date": course.start_date.isoformat(),
            "daily_times": course.daily_times,
            "timezone": course.timezone,
        },
    )
    return await finish(db, patient, key, "create", course, output(patient, course, rx))


async def change(db, patient, course_id, payload, key):
    previous = await begin(db, patient, key, "status", course_id, payload)
    if previous is not None:
        return previous
    course, rx = await load(db, patient, course_id)
    check_version(course, payload.version)
    allowed = {
        "active": {"paused", "stopped", "completed"},
        "paused": {"active", "stopped", "completed"},
        "stopped": {"active"},
        "completed": {"active"},
    }
    if payload.status not in allowed[course.status]:
        raise HTTPException(409, "this tracking status transition is unavailable")
    if payload.status == "active" and rx and rx.status != "issued":
        raise HTTPException(409, "the prescription was withdrawn; it cannot resume tracking")
    moment = now()
    plan = plan_on(course, moment.astimezone(ZoneInfo(course.timezone)).date())
    if (
        payload.status == "active"
        and plan["end_date"]
        and moment.astimezone(ZoneInfo(course.timezone)).date() > plan["end_date"]
    ):
        raise HTTPException(409, "the planned tracking period has ended")
    event(
        db,
        course,
        "status",
        {
            "from": course.status,
            "to": payload.status,
            "reason": payload.reason,
            "effective_at": moment.isoformat(),
            "version": course.version + 1,
        },
    )
    course.status = payload.status
    if payload.status == "active" and course.reminders_enabled:
        course.reminders_since = moment
    course.version += 1
    await db.flush()
    return await finish(db, patient, key, "status", course, output(patient, course, rx))


async def revise_schedule(db, patient, course_id, payload, key):
    previous = await begin(db, patient, key, "schedule", course_id, payload)
    if previous is not None:
        return previous
    course, rx = await load(db, patient, course_id)
    check_version(course, payload.version)
    today = now().astimezone(ZoneInfo(course.timezone)).date()
    if rx and rx.status != "issued":
        raise HTTPException(409, "a withdrawn prescription cannot receive a new tracking plan")
    if course.status not in {"active", "paused"}:
        raise HTTPException(409, "resume tracking before editing its future schedule")
    if (
        not max(today + timedelta(days=1), course.start_date)
        <= payload.effective_date
        <= today + timedelta(days=365)
    ):
        raise HTTPException(422, "choose a future date on or after the tracking start")
    if (
        payload.end_date
        and not payload.effective_date
        <= payload.end_date
        <= course.start_date + timedelta(days=3650)
    ):
        raise HTTPException(
            422, "end date must be on or after the new plan starts and within the supported range"
        )
    # A new revision replaces all not-yet-effective revisions. Those prior intentions
    # remain in the immutable activity event, but cannot unexpectedly reappear later.
    old = course.schedule_changes or []
    retained = [revision for revision in old if revision["effective_date"] <= today.isoformat()]
    if len(retained) >= 100:
        raise HTTPException(409, "this course has reached its schedule revision limit")
    revision = payload.model_dump(
        mode="json", include={"effective_date", "end_date", "daily_times"}
    )
    course.schedule_changes = [*retained, revision]
    course.version += 1
    event(
        db,
        course,
        "schedule_changed",
        {
            "before": old,
            "after": course.schedule_changes,
            "reason": payload.reason,
            "version": course.version,
        },
    )
    await db.flush()
    return await finish(db, patient, key, "schedule", course, output(patient, course, rx))


async def change_reminders(db, patient, course_id, payload, key):
    previous = await begin(db, patient, key, "reminders", course_id, payload)
    if previous is not None:
        return previous
    course, rx = await load(db, patient, course_id)
    check_version(course, payload.version)
    if payload.enabled and (course.status != "active" or (rx and rx.status != "issued")):
        raise HTTPException(409, "reminders require an active course and current prescription")
    if payload.enabled != course.reminders_enabled:
        course.reminders_enabled = payload.enabled
        course.reminders_since = now() if payload.enabled else None
        course.version += 1
        event(
            db, course, "reminders_changed", {"enabled": payload.enabled, "version": course.version}
        )
    await db.flush()
    return await finish(db, patient, key, "reminders", course, output(patient, course, rx))


def scheduled_at(course, day, clock):
    naive = datetime.combine(day, time.fromisoformat(clock))
    local = naive.replace(tzinfo=ZoneInfo(course.timezone), fold=0)
    utc = local.astimezone(UTC)
    # A missing spring-forward time is not a dose; a repeated fall-back slot occurs once.
    if utc.astimezone(ZoneInfo(course.timezone)).replace(tzinfo=None) != naive:
        return None
    return utc


async def statuses(db, ids):
    if not ids:
        return []
    return list(
        await db.scalars(select(Event).where(Event.course_id.in_(ids), Event.kind == "status"))
    )


def eligible(course, rx, at, events):
    day = at.astimezone(ZoneInfo(course.timezone)).date()
    plan = plan_on(course, day)
    if day < course.start_date or (plan["end_date"] and day > plan["end_date"]):
        return False
    if rx and (at < aware(rx.issued_at) or (rx.cancelled_at and at >= aware(rx.cancelled_at))):
        return False
    changes = [
        (datetime.fromisoformat(e.payload["effective_at"]), e.payload["to"])
        for e in sorted(events, key=lambda e: e.payload["version"])
        if e.course_id == course.id
    ]
    state = "active"
    for changed_at, next_state in changes:
        if changed_at <= at:
            state = next_state
    return state == "active"


async def record_dose(db, patient, course_id, payload, key):
    previous = await begin(db, patient, key, "dose", course_id, payload)
    if previous is not None:
        return previous
    course, rx = await load(db, patient, course_id)
    check_version(course, payload.version)
    day = (
        payload.occurred_at.astimezone(ZoneInfo(course.timezone)).date()
        if payload.occurred_at
        else payload.day
    )
    plan = plan_on(course, day)
    if plan["daily_times"]:
        if payload.occurred_at is not None or payload.time not in plan["daily_times"]:
            raise HTTPException(422, "select a saved tracking time")
        at = scheduled_at(course, payload.day, payload.time)
        slot = f"{payload.day.isoformat()}T{payload.time}"
    else:
        if payload.occurred_at is None:
            raise HTTPException(422, "manual tracking requires an occurrence time")
        at = payload.occurred_at.astimezone(UTC)
        slot = "manual:" + at.isoformat()
    if at is None or at > now():
        raise HTTPException(422, "future or nonexistent tracking times cannot be reported")
    if not eligible(course, rx, at, await statuses(db, [course.id])):
        raise HTTPException(409, "tracking was not active at this time")
    if await db.scalar(select(Dose.id).where(Dose.course_id == course.id, Dose.slot == slot)):
        raise HTTPException(409, "this dose already has an entry; correct the saved entry instead")
    dose = Dose(
        course_id=course.id,
        slot=slot,
        day=at.astimezone(ZoneInfo(course.timezone)).date(),
        time=payload.time,
        scheduled_at=at if plan["daily_times"] else None,
        occurred_at=at if not plan["daily_times"] else None,
        outcome=payload.outcome,
        note=payload.note,
    )
    db.add(dose)
    await db.flush()
    result = dose_output(patient, dose)
    event(db, course, "dose_recorded", result.model_dump(mode="json"))
    return await finish(db, patient, key, "dose", course, result)


async def correct_dose(db, patient, course_id, dose_id, payload, key):
    previous = await begin(db, patient, key, "dose_correction", dose_id, payload)
    if previous is not None:
        # Bind the course path too, even though dose UUIDs are globally unique.
        if previous["course_id"] != str(course_id):
            raise HTTPException(409, "request course conflicts")
        return previous
    course, _ = await load(db, patient, course_id)
    dose = await db.scalar(select(Dose).where(Dose.id == dose_id, Dose.course_id == course.id))
    if dose is None:
        raise HTTPException(404, "dose entry not found")
    check_version(dose, payload.version)
    if dose.outcome == payload.outcome:
        raise HTTPException(409, "the entry already has this outcome")
    old = dose_output(patient, dose).model_dump(mode="json")
    dose.outcome = payload.outcome
    dose.version += 1
    await db.flush()
    result = dose_output(patient, dose)
    event(
        db,
        course,
        "dose_corrected",
        {"before": old, "after": result.model_dump(mode="json"), "reason": payload.reason},
    )
    return await finish(db, patient, key, "dose_correction", course, result)


async def tracking(db, patient, day, limit, offset):
    rows = (
        await db.execute(
            selection(patient)
            .where(Course.start_date <= day)
            .order_by(Course.created_at.desc(), Course.id.desc())
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    ids = [course.id for course, _ in rows[:limit]]
    entries = (
        list(await db.scalars(select(Dose).where(Dose.course_id.in_(ids), Dose.day == day)))
        if ids
        else []
    )
    changes = await statuses(db, ids)
    moment = now()
    result = []
    for course, rx in rows[:limit]:
        plan = plan_on(course, day)
        doses = {dose.time: dose for dose in entries if dose.course_id == course.id and dose.time}
        slots = []
        for clock in plan["daily_times"]:
            at = scheduled_at(course, day, clock)
            dose = doses.get(clock)
            state = (
                dose.outcome
                if dose
                else "not_scheduled"
                if at is None or not eligible(course, rx, at, changes)
                else "upcoming"
                if at > moment
                else "due"
            )
            slots.append(
                TrackingSlot(
                    time=clock,
                    scheduled_at=at,
                    state=state,
                    dose=dose_output(patient, dose) if dose else None,
                )
            )
        result.append(
            TrackingCourse(
                course=output(patient, course, rx, day),
                slots=slots,
                manual_entries=[
                    dose_output(patient, d)
                    for d in entries
                    if d.course_id == course.id and d.time is None
                ],
            )
        )
    return {
        "day": day,
        "server_now": moment,
        "items": result,
        "limit": limit,
        "offset": offset,
        "next_offset": offset + limit if len(rows) > limit else None,
    }

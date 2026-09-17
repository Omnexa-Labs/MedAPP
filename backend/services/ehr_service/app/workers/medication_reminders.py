"""Due-time push delivery: python -m app.workers.medication_reminders [--once].

Persist each attempt BEFORE contacting Expo. An ambiguous send is never replayed;
avoiding duplicate dose prompts is preferable to resending a possibly accepted one.
"""

import argparse
import asyncio
import logging
from datetime import timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..config import settings
from ..db import SessionLocal
from ..models.medication import MedicationCourse as Course
from ..models.medication import MedicationDose as Dose
from ..models.medication import MedicationReminderAttempt as Attempt
from ..models.medication import MedicationReminderDevice as Device
from ..models.record import PatientRecord
from ..services import medications as service

WINDOW = timedelta(minutes=5)


def due_slots(course, rx, changes, moment):
    if not course.reminders_enabled or course.status != "active" or (rx and rx.status != "issued"):
        return []
    zone = ZoneInfo(course.timezone)
    days = {(moment - WINDOW).astimezone(zone).date(), moment.astimezone(zone).date()}
    result = []
    for day in sorted(days):
        for clock in service.plan_on(course, day)["daily_times"]:
            at = service.scheduled_at(course, day, clock)
            if (
                at
                and moment - WINDOW < at <= moment
                and course.reminders_since
                and at >= service.aware(course.reminders_since)
                and service.eligible(course, rx, at, changes)
            ):
                result.append((at, f"{day.isoformat()}T{clock}"))
    return result


async def submit(token):
    headers = {"Accept": "application/json"}
    secret = settings.expo_access_token.get_secret_value()
    if secret:
        headers["Authorization"] = f"Bearer {secret}"
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
            response = await client.post(
                "https://exp.host/--/api/v2/push/send",
                headers=headers,
                json={
                    "to": token,
                    "title": "MedApp reminder",
                    "body": "Open MedApp to review your dose tracker.",
                    "data": {"kind": "medication_reminder"},
                    "sound": "default",
                    "channelId": "medication-reminders",
                    "ttl": 60,
                },
            )
        if response.status_code != 200:
            return "unconfirmed", None, "provider_http_error"
        ticket = response.json().get("data")
        if (
            isinstance(ticket, dict)
            and ticket.get("status") == "ok"
            and isinstance(ticket.get("id"), str)
        ):
            return "accepted", ticket["id"][:255], None
        if isinstance(ticket, dict) and ticket.get("status") == "error":
            code = ticket.get("details", {}).get("error")
            return (
                "rejected",
                None,
                "device_not_registered" if code == "DeviceNotRegistered" else "provider_rejected",
            )
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        pass
    return "unconfirmed", None, "provider_response_unconfirmed"


async def process_course(course_id, factory=SessionLocal, sender=submit):
    work = []
    async with factory() as db:
        patient_id = await db.scalar(select(Course.patient_id).where(Course.id == course_id))
        if patient_id is None:
            return 0
        patient = await db.scalar(
            select(PatientRecord).where(PatientRecord.id == patient_id).with_for_update()
        )
        course, rx = await service.load(db, patient, course_id)
        moment = service.now()
        slots = due_slots(course, rx, await service.statuses(db, [course_id]), moment)
        if not slots:
            return 0
        devices = list(
            await db.scalars(
                select(Device)
                .where(
                    Device.patient_id == patient.id,
                    Device.enabled.is_(True),
                    Device.expires_at > moment,
                )
                .with_for_update()
            )
        )
        insert = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
        for at, slot in slots:
            if await db.scalar(
                select(Dose.id).where(Dose.course_id == course_id, Dose.slot == slot)
            ):
                continue
            for device in devices:
                if at < service.aware(device.updated_at):
                    continue
                attempt_id = await db.scalar(
                    insert(Attempt)
                    .values(
                        course_id=course_id,
                        device_id=device.id,
                        scheduled_at=at,
                        state="unconfirmed",
                    )
                    .on_conflict_do_nothing(
                        index_elements=[Attempt.course_id, Attempt.device_id, Attempt.scheduled_at]
                    )
                    .returning(Attempt.id)
                )
                if attempt_id:
                    work.append((attempt_id, device.binding_id, patient.id, slot))
        await db.commit()

    for attempt_id, binding_id, patient_id, slot in work:
        async with factory() as db:
            # Same lock order as patient writes; hold only for this bounded send.
            # A status/withdrawal/disable committed first suppresses this attempt.
            patient = await db.scalar(
                select(PatientRecord).where(PatientRecord.id == patient_id).with_for_update()
            )
            course, rx = await service.load(db, patient, course_id)
            attempt = await db.get(Attempt, attempt_id)
            device = await db.scalar(
                select(Device).where(Device.id == attempt.device_id).with_for_update()
            )
            moment = service.now()
            due = due_slots(course, rx, await service.statuses(db, [course_id]), moment)
            reported = await db.scalar(
                select(Dose.id).where(Dose.course_id == course_id, Dose.slot == slot)
            )
            if (
                not settings.medication_push_enabled
                or reported
                or device.patient_id != patient_id
                or device.binding_id != binding_id
                or not device.enabled
                or service.aware(device.expires_at) <= moment
                or not any(at == service.aware(attempt.scheduled_at) for at, _ in due)
            ):
                attempt.state = "suppressed"
            else:
                attempt.state, attempt.provider_reference, attempt.error_code = await sender(
                    device.push_token
                )
                if attempt.error_code == "device_not_registered":
                    device.enabled = False
            await db.commit()
    return len(work)


async def run_once(factory=SessionLocal, sender=submit):
    if not settings.medication_push_enabled:
        return 0
    cursor, count = None, 0
    while True:
        async with factory() as db:
            query = select(Course.id).where(
                Course.reminders_enabled.is_(True), Course.status == "active"
            )
            if cursor:
                query = query.where(Course.id > cursor)
            ids = list(await db.scalars(query.order_by(Course.id).limit(100)))
        if not ids:
            return count
        for course_id in ids:
            count += await process_course(course_id, factory, sender)
        cursor = ids[-1]


async def main(once):
    while True:
        try:
            await run_once()
        except Exception:
            # Do not emit push tokens, medicine data or provider response bodies.
            logging.getLogger(__name__).error(
                "Medication reminder pass failed; inspect worker/database health"
            )
            if once:
                raise
        if once:
            return
        await asyncio.sleep(15)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    asyncio.run(main(parser.parse_args().once))

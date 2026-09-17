"""Invoked in a disposable EHR PostgreSQL database; never contacts Expo."""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.config import settings
from app.db import SessionLocal
from app.models.medication import MedicationCourse as Course
from app.models.medication import MedicationReminderAttempt as Attempt
from app.models.medication import MedicationReminderDevice as Device
from app.models.record import PatientRecord
from app.services import medications as service
from app.workers import medication_reminders as worker
from sqlalchemy import func, select


async def main():
    settings.medication_push_enabled = True
    moment = datetime.now(UTC).replace(second=1, microsecond=0)
    service.now = lambda: moment
    async with SessionLocal() as db:
        patient = PatientRecord(user_id=uuid4())
        db.add(patient)
        await db.flush()
        course = Course(
            patient_id=patient.id,
            medicine={},
            source="self_reported",
            status="active",
            start_date=(moment - timedelta(days=1)).date(),
            timezone="UTC",
            daily_times=[moment.strftime("%H:%M")],
            reminders_enabled=True,
            reminders_since=moment - timedelta(hours=1),
        )
        device = Device(
            patient_id=patient.id,
            push_token="ExpoPushToken[disposable_worker_qa]",
            binding_id=uuid4(),
            enabled=True,
            expires_at=moment + timedelta(days=1),
            updated_at=moment - timedelta(hours=1),
        )
        db.add_all([course, device])
        await db.commit()
        course_id = course.id
    sends = []

    async def sender(token):
        sends.append(token)
        await asyncio.sleep(0.03)
        return "accepted", "qa-provider-ticket", None

    counts = await asyncio.gather(
        worker.run_once(SessionLocal, sender), worker.run_once(SessionLocal, sender)
    )
    assert sum(counts) == 1 and len(sends) == 1
    assert await worker.run_once(SessionLocal, sender) == 0
    async with SessionLocal() as db:
        assert (
            await db.scalar(select(func.count(Attempt.id)).where(Attempt.course_id == course_id))
            == 1
        )
        assert (
            await db.scalar(select(Attempt.state).where(Attempt.course_id == course_id))
            == "accepted"
        )
    print("Concurrent PostgreSQL reminder workers submitted once; subsequent pass did not resend.")


if __name__ == "__main__":
    asyncio.run(main())

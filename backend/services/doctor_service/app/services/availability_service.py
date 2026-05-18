from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models import DoctorAvailabilityRule, DoctorProfile
from ..schemas.availability import AvailabilityRuleCreate, SlotOut


class AvailabilityError(ValueError):
    pass


def _ensure_owner(principal: Principal, profile: DoctorProfile) -> None:
    if principal.role not in {"doctor", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "doctor access required")
    if principal.role != "admin" and profile.user_id != UUID(principal.subject):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only manage your own availability")


async def _load_profile(db: AsyncSession, doctor_id: UUID) -> DoctorProfile:
    profile = await db.get(DoctorProfile, doctor_id)
    if not profile or not profile.is_active:
        raise AvailabilityError("doctor profile not found")
    return profile


async def replace_availability_rules(
    db: AsyncSession,
    principal: Principal,
    doctor_id: UUID,
    payload: list[AvailabilityRuleCreate],
) -> list[DoctorAvailabilityRule]:
    profile = await _load_profile(db, doctor_id)
    _ensure_owner(principal, profile)

    await db.execute(delete(DoctorAvailabilityRule).where(DoctorAvailabilityRule.doctor_id == doctor_id))
    rules: list[DoctorAvailabilityRule] = []
    for item in payload:
        if item.end_time <= item.start_time:
            raise AvailabilityError("availability end_time must be after start_time")
        rule = DoctorAvailabilityRule(
            doctor_id=doctor_id,
            day_of_week=item.day_of_week,
            start_time=item.start_time,
            end_time=item.end_time,
            timezone=item.timezone,
            is_active=True,
        )
        db.add(rule)
        rules.append(rule)
    await db.flush()
    for rule in rules:
        await db.refresh(rule)
    return rules


async def list_availability_rules(db: AsyncSession, doctor_id: UUID) -> list[DoctorAvailabilityRule]:
    stmt = (
        select(DoctorAvailabilityRule)
        .where(DoctorAvailabilityRule.doctor_id == doctor_id)
        .where(DoctorAvailabilityRule.is_active.is_(True))
        .order_by(DoctorAvailabilityRule.day_of_week.asc(), DoctorAvailabilityRule.start_time.asc())
    )
    result = await db.scalars(stmt)
    return list(result.all())


async def compute_slots(
    db: AsyncSession,
    doctor_id: UUID,
    from_date,
    to_date,
    slot_minutes: int,
) -> list[SlotOut]:
    profile = await _load_profile(db, doctor_id)
    rules = await list_availability_rules(db, doctor_id)
    if from_date > to_date:
        raise AvailabilityError("from_date must be on or before to_date")

    slots: list[SlotOut] = []
    current = from_date
    step = timedelta(minutes=slot_minutes)
    while current <= to_date:
        weekday = current.weekday()
        for rule in rules:
            if rule.day_of_week != weekday:
                continue
            starts_at = datetime.combine(current, rule.start_time)
            ends_at = datetime.combine(current, rule.end_time)
            cursor = starts_at
            while cursor + step <= ends_at:
                slots.append(
                    SlotOut(
                        doctor_id=profile.doctor_id,
                        starts_at=cursor,
                        ends_at=cursor + step,
                        timezone=rule.timezone,
                    )
                )
                cursor += step
        current += timedelta(days=1)
    return slots
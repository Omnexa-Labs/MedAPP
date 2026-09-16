from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
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
    if (to_date - from_date).days > 30:
        raise AvailabilityError("request at most 31 calendar days")
    if not 5 <= slot_minutes <= 240:
        raise AvailabilityError("slot_minutes must be between 5 and 240")

    slots: list[SlotOut] = []
    current = from_date
    step = timedelta(minutes=slot_minutes)
    while current <= to_date:
        weekday = current.weekday()
        for rule in rules:
            if rule.day_of_week != weekday:
                continue
            try:
                zone = ZoneInfo(rule.timezone)
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise AvailabilityError("availability has an invalid timezone") from exc
            # Walk elapsed instants, retaining both repeated clocks at fall-back
            # and skipping nonexistent clocks at spring-forward. Boundaries
            # inside a DST gap are not offered until the clinician fixes them.
            def boundary(clock, fold):
                local = datetime.combine(current, clock).replace(tzinfo=zone, fold=fold)
                instant = local.astimezone(timezone.utc)
                if instant.astimezone(zone).replace(tzinfo=None) != local.replace(tzinfo=None):
                    return None
                return instant
            starts_at = boundary(rule.start_time, 0)
            ends_at = boundary(rule.end_time, 1)
            if starts_at is None or ends_at is None:
                continue
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
    unique = {(slot.starts_at, slot.ends_at): slot for slot in slots}
    return sorted(unique.values(), key=lambda slot: slot.starts_at)

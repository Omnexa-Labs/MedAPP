from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models import HospitalProfile, HospitalReview, HospitalStaff, StaffRole
from ..schemas.hospital import HospitalCreate, HospitalStaffCreate


class HospitalError(ValueError):
    pass


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc


def _require_admin(principal: Principal) -> None:
    if principal.role not in {"hospital_admin", "platform_admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin access required")


def _require_staff_writer(principal: Principal) -> None:
    if principal.role not in {"hospital_admin", "platform_admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin access required")


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


async def create_hospital(db: AsyncSession, principal: Principal, payload: HospitalCreate) -> HospitalProfile:
    _require_admin(principal)
    hospital = HospitalProfile(
        name=payload.name.strip(),
        slug=payload.slug.strip(),
        description=_normalize_text(payload.description),
        specialty=_normalize_text(payload.specialty),
        insurance_accepted=payload.insurance_accepted,
        address_line1=_normalize_text(payload.address_line1),
        city=_normalize_text(payload.city),
        country=_normalize_text(payload.country),
        latitude=payload.latitude,
        longitude=payload.longitude,
        website_url=_normalize_text(payload.website_url),
        contact_phone=_normalize_text(payload.contact_phone),
        contact_email=_normalize_text(payload.contact_email),
        accreditation=_normalize_text(payload.accreditation),
    )
    db.add(hospital)
    await db.flush()
    await db.refresh(hospital)
    return hospital


async def list_hospitals(
    db: AsyncSession,
    *,
    specialty: str | None = None,
    insurance: str | None = None,
    city: str | None = None,
    country: str | None = None,
) -> list[HospitalProfile]:
    stmt = select(HospitalProfile).where(HospitalProfile.is_active.is_(True))
    if specialty:
        stmt = stmt.where(HospitalProfile.specialty.ilike(f"%{specialty.strip()}%"))
    if city:
        stmt = stmt.where(HospitalProfile.city.ilike(f"%{city.strip()}%"))
    if country:
        stmt = stmt.where(HospitalProfile.country.ilike(f"%{country.strip()}%"))
    if insurance:
        stmt = stmt.where(HospitalProfile.insurance_accepted.contains([insurance.strip()]))
    stmt = stmt.order_by(HospitalProfile.name.asc())
    result = await db.scalars(stmt)
    return list(result.all())


async def get_hospital(db: AsyncSession, hospital_id: UUID) -> HospitalProfile:
    hospital = await db.get(HospitalProfile, hospital_id)
    if hospital is None:
        raise HospitalError("hospital not found")
    return hospital


async def add_staff_member(db: AsyncSession, principal: Principal, hospital_id: UUID, payload: HospitalStaffCreate) -> HospitalStaff:
    _require_staff_writer(principal)
    hospital = await db.get(HospitalProfile, hospital_id)
    if hospital is None:
        raise HospitalError("hospital not found")
    staff = HospitalStaff(
        hospital_id=hospital_id,
        user_id=payload.user_id,
        role=payload.role.strip() or StaffRole.OTHER,
        title=_normalize_text(payload.title),
        department=_normalize_text(payload.department),
    )
    db.add(staff)
    await db.flush()
    await db.refresh(staff)
    return staff


async def list_reviews(db: AsyncSession, hospital_id: UUID) -> list[HospitalReview]:
    stmt = select(HospitalReview).where(HospitalReview.hospital_id == hospital_id).where(HospitalReview.is_public.is_(True)).order_by(HospitalReview.created_at.desc())
    result = await db.scalars(stmt)
    return list(result.all())
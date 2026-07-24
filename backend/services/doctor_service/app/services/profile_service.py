from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models import DoctorProfile
from ..schemas.doctor import DoctorCreate, DoctorUpdate


class DoctorProfileError(ValueError):
    pass


def _normalize_languages(languages: list[str] | None) -> list[str]:
    return [language.strip() for language in languages or [] if language.strip()]


def _ensure_mutation_access(principal: Principal, profile: DoctorProfile | None = None) -> None:
    if principal.role not in {"doctor", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "doctor access required")
    if profile is not None and principal.role != "admin" and profile.user_id != UUID(principal.subject):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only manage your own doctor profile")


async def create_doctor_profile(
    db: AsyncSession,
    principal: Principal,
    payload: DoctorCreate,
) -> DoctorProfile:
    _ensure_mutation_access(principal)
    try:
        user_id = str(UUID(principal.subject))
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc

    user_uuid = UUID(user_id)
    existing = await db.scalar(select(DoctorProfile).where(DoctorProfile.user_id == user_uuid))
    if existing:
        raise DoctorProfileError("doctor profile already exists")

    profile = DoctorProfile(
        user_id=user_uuid,
        first_name=payload.first_name,
        last_name=payload.last_name,
        specialty=payload.specialty,
        bio=payload.bio,
        languages=_normalize_languages(payload.languages),
        consultation_fee_cents=payload.consultation_fee_cents,
        photo_url=payload.photo_url,
        is_listable=payload.is_listable,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile


async def list_doctor_profiles(
    db: AsyncSession,
    *,
    q: str | None = None,
    specialty: str | None = None,
    only_listable: bool = True,
) -> list[DoctorProfile]:
    stmt = select(DoctorProfile).where(DoctorProfile.is_active.is_(True))
    if only_listable:
        stmt = stmt.where(DoctorProfile.is_listable.is_(True))
    if specialty:
        stmt = stmt.where(DoctorProfile.specialty.ilike(f"%{specialty}%"))
    # Free-text search added in the Find-Care wiring work (audit ref:
    # plan merry-seeking-gem). Case-insensitive substring across the
    # most-searched fields. ILIKE is the same primitive list_drugs
    # uses in hms_service — no tsvector index yet; revisit if list
    # sizes pass ~5k.
    if q:
        needle = f"%{q.strip()}%"
        if needle != "%%":
            stmt = stmt.where(
                or_(
                    DoctorProfile.first_name.ilike(needle),
                    DoctorProfile.last_name.ilike(needle),
                    DoctorProfile.specialty.ilike(needle),
                    DoctorProfile.bio.ilike(needle),
                )
            )
    stmt = stmt.order_by(DoctorProfile.last_name.asc(), DoctorProfile.first_name.asc())
    result = await db.scalars(stmt)
    return list(result.all())


async def get_doctor_profile(db: AsyncSession, doctor_id: UUID) -> DoctorProfile:
    profile = await db.get(DoctorProfile, doctor_id)
    if not profile or not profile.is_active:
        raise DoctorProfileError("doctor profile not found")
    return profile


async def update_doctor_profile(
    db: AsyncSession,
    principal: Principal,
    doctor_id: UUID,
    payload: DoctorUpdate,
) -> DoctorProfile:
    profile = await get_doctor_profile(db, doctor_id)
    _ensure_mutation_access(principal, profile)

    updates = payload.model_dump(exclude_unset=True)
    if "languages" in updates and updates["languages"] is not None:
        updates["languages"] = _normalize_languages(updates["languages"])
    for key, value in updates.items():
        setattr(profile, key, value)

    await db.flush()
    await db.refresh(profile)
    return profile


async def delete_doctor_profile(
    db: AsyncSession,
    principal: Principal,
    doctor_id: UUID,
) -> None:
    profile = await get_doctor_profile(db, doctor_id)
    _ensure_mutation_access(principal, profile)
    await db.delete(profile)
    await db.flush()
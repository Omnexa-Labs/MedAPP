"""Pharmacist directory business logic.

Patterned exactly on doctor_service.profile_service.py. The differences:

  - Mutator role is `pharmacist` (or `admin`).
  - ?q= search spans first_name + last_name + license_number.
  - Pagination (limit/offset) is part of the contract from day one,
    returning (items, total) so the list response can carry both.
  - Optional `?pharmacy_id=` filter narrows to pharmacists affiliated
    with a specific PharmacyProfile (soft cross-service UUID).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models import PharmacistProfile
from ..schemas.pharmacist import PharmacistCreate, PharmacistUpdate


class PharmacistError(ValueError):
    pass


def _normalize_strings(values: list[str] | None) -> list[str]:
    return [v.strip() for v in values or [] if v.strip()]


def _ensure_mutation_access(
    principal: Principal,
    profile: PharmacistProfile | None = None,
) -> None:
    if principal.role not in {"pharmacist", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "pharmacist access required")
    if profile is not None and principal.role != "admin" and profile.user_id != UUID(principal.subject):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only manage your own pharmacist profile")


async def create_pharmacist_profile(
    db: AsyncSession,
    principal: Principal,
    payload: PharmacistCreate,
) -> PharmacistProfile:
    _ensure_mutation_access(principal)
    try:
        user_uuid = UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc

    existing = await db.scalar(
        select(PharmacistProfile).where(PharmacistProfile.user_id == user_uuid)
    )
    if existing:
        raise PharmacistError("pharmacist profile already exists for this user")

    profile = PharmacistProfile(
        user_id=user_uuid,
        first_name=payload.first_name,
        last_name=payload.last_name,
        license_number=payload.license_number,
        bio=payload.bio,
        languages=_normalize_strings(payload.languages),
        specialties=_normalize_strings(payload.specialties),
        photo_url=payload.photo_url,
        affiliated_pharmacy_id=payload.affiliated_pharmacy_id,
        is_listable=payload.is_listable,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile


async def list_pharmacist_profiles(
    db: AsyncSession,
    *,
    q: str | None = None,
    pharmacy_id: UUID | None = None,
    only_listable: bool = True,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[PharmacistProfile], int]:
    base = select(PharmacistProfile).where(PharmacistProfile.is_active.is_(True))
    if only_listable:
        base = base.where(PharmacistProfile.is_listable.is_(True))
    if pharmacy_id is not None:
        base = base.where(PharmacistProfile.affiliated_pharmacy_id == pharmacy_id)
    if q:
        needle = f"%{q}%"
        base = base.where(
            or_(
                PharmacistProfile.first_name.ilike(needle),
                PharmacistProfile.last_name.ilike(needle),
                PharmacistProfile.license_number.ilike(needle),
            )
        )

    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0

    page = (
        base.order_by(PharmacistProfile.last_name.asc(), PharmacistProfile.first_name.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.scalars(page)
    return list(result.all()), int(total)


async def get_pharmacist_profile(db: AsyncSession, pharmacist_id: UUID) -> PharmacistProfile:
    profile = await db.get(PharmacistProfile, pharmacist_id)
    if not profile or not profile.is_active:
        raise PharmacistError("pharmacist not found")
    return profile


async def update_pharmacist_profile(
    db: AsyncSession,
    principal: Principal,
    pharmacist_id: UUID,
    payload: PharmacistUpdate,
) -> PharmacistProfile:
    profile = await get_pharmacist_profile(db, pharmacist_id)
    _ensure_mutation_access(principal, profile)

    updates = payload.model_dump(exclude_unset=True)
    if "languages" in updates and updates["languages"] is not None:
        updates["languages"] = _normalize_strings(updates["languages"])
    if "specialties" in updates and updates["specialties"] is not None:
        updates["specialties"] = _normalize_strings(updates["specialties"])
    for key, value in updates.items():
        setattr(profile, key, value)

    await db.flush()
    await db.refresh(profile)
    return profile


async def delete_pharmacist_profile(
    db: AsyncSession,
    principal: Principal,
    pharmacist_id: UUID,
) -> None:
    profile = await get_pharmacist_profile(db, pharmacist_id)
    _ensure_mutation_access(principal, profile)
    await db.delete(profile)
    await db.flush()

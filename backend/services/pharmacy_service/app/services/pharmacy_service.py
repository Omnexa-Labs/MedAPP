"""Pharmacy directory business logic.

Mirrors doctor_service.profile_service.py one-to-one. The two real
differences from doctor_service:

  1. Pharmacies are owned by a "pharmacy" role principal (or admin),
     not a "doctor" role. Same ownership pattern (user_id == subject)
     otherwise.

  2. The list endpoint supports free-text ?q= search over name,
     description, city, and address_line1 plus the existing categorical
     filters (?city=, ?insurance=). The search is `or_(... ILIKE ...)`
     across the listed fields — same pattern as the audit-finding-free
     `list_drugs` in hms_service.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models import PharmacyProfile
from ..schemas.pharmacy import PharmacyCreate, PharmacyUpdate


class PharmacyError(ValueError):
    pass


def _normalize_strings(values: list[str] | None) -> list[str]:
    return [v.strip() for v in values or [] if v.strip()]


def _ensure_mutation_access(
    principal: Principal,
    profile: PharmacyProfile | None = None,
) -> None:
    if principal.role not in {"pharmacy", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "pharmacy access required")
    if profile is not None and principal.role != "admin" and profile.user_id != UUID(principal.subject):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only manage your own pharmacy profile")


async def create_pharmacy_profile(
    db: AsyncSession,
    principal: Principal,
    payload: PharmacyCreate,
) -> PharmacyProfile:
    _ensure_mutation_access(principal)
    try:
        user_uuid = UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc

    # One pharmacy per user — same as doctor / nurse. If a chain owner
    # needs multiple, they're a different role / model entirely.
    existing = await db.scalar(select(PharmacyProfile).where(PharmacyProfile.user_id == user_uuid))
    if existing:
        raise PharmacyError("pharmacy profile already exists for this user")

    slug_taken = await db.scalar(select(PharmacyProfile).where(PharmacyProfile.slug == payload.slug))
    if slug_taken:
        raise PharmacyError("pharmacy slug already in use")

    profile = PharmacyProfile(
        user_id=user_uuid,
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        license_number=payload.license_number,
        license_categories=_normalize_strings(payload.license_categories),
        address_line1=payload.address_line1,
        city=payload.city,
        country=payload.country,
        latitude=payload.latitude,
        longitude=payload.longitude,
        phone=payload.phone,
        email=payload.email,
        website_url=payload.website_url,
        insurance_accepted=_normalize_strings(payload.insurance_accepted),
        operating_hours=payload.operating_hours,
        photo_url=payload.photo_url,
        pms_base_url=payload.pms_base_url,
        pms_partner_secret_id=payload.pms_partner_secret_id,
        is_listable=payload.is_listable,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile


async def list_pharmacy_profiles(
    db: AsyncSession,
    *,
    q: str | None = None,
    city: str | None = None,
    insurance: str | None = None,
    only_listable: bool = True,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[PharmacyProfile], int]:
    """Return `(items, total)` for the current page.

    `total` is the count of rows that match the filters before
    pagination — the client uses it to render "N of M" without a
    second round-trip. Pagination cap of 200 is enforced at the
    router layer (Query(le=200)).
    """
    base = select(PharmacyProfile).where(PharmacyProfile.is_active.is_(True))
    if only_listable:
        base = base.where(PharmacyProfile.is_listable.is_(True))
    if city:
        base = base.where(PharmacyProfile.city.ilike(f"%{city}%"))
    if insurance:
        # insurance_accepted is text[] on Postgres; the `.any()` operator
        # is the idiomatic ARRAY contains. On SQLite (tests) ARRAY falls
        # back to JSON; the conftest installs a compile hook so this
        # query becomes a LIKE on the JSON text — close enough for
        # smoke tests.
        base = base.where(PharmacyProfile.insurance_accepted.any(insurance))
    if q:
        needle = f"%{q}%"
        base = base.where(
            or_(
                PharmacyProfile.name.ilike(needle),
                PharmacyProfile.description.ilike(needle),
                PharmacyProfile.city.ilike(needle),
                PharmacyProfile.address_line1.ilike(needle),
            )
        )

    # Total before pagination — separate count query against the same
    # filter set. SQLAlchemy doesn't have a clean .count() on a select;
    # subquery is the idiomatic pattern.
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0

    page = (
        base.order_by(PharmacyProfile.name.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.scalars(page)
    return list(result.all()), int(total)


async def get_pharmacy_profile(db: AsyncSession, pharmacy_id: UUID) -> PharmacyProfile:
    profile = await db.get(PharmacyProfile, pharmacy_id)
    if not profile or not profile.is_active:
        raise PharmacyError("pharmacy not found")
    return profile


async def update_pharmacy_profile(
    db: AsyncSession,
    principal: Principal,
    pharmacy_id: UUID,
    payload: PharmacyUpdate,
) -> PharmacyProfile:
    profile = await get_pharmacy_profile(db, pharmacy_id)
    _ensure_mutation_access(principal, profile)

    updates = payload.model_dump(exclude_unset=True)
    if "license_categories" in updates and updates["license_categories"] is not None:
        updates["license_categories"] = _normalize_strings(updates["license_categories"])
    if "insurance_accepted" in updates and updates["insurance_accepted"] is not None:
        updates["insurance_accepted"] = _normalize_strings(updates["insurance_accepted"])
    if "slug" in updates and updates["slug"] is not None and updates["slug"] != profile.slug:
        slug_taken = await db.scalar(
            select(PharmacyProfile).where(PharmacyProfile.slug == updates["slug"])
        )
        if slug_taken:
            raise PharmacyError("pharmacy slug already in use")
    for key, value in updates.items():
        setattr(profile, key, value)

    await db.flush()
    await db.refresh(profile)
    return profile


async def delete_pharmacy_profile(
    db: AsyncSession,
    principal: Principal,
    pharmacy_id: UUID,
) -> None:
    profile = await get_pharmacy_profile(db, pharmacy_id)
    _ensure_mutation_access(principal, profile)
    await db.delete(profile)
    await db.flush()

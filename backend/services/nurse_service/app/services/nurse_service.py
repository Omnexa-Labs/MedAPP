from __future__ import annotations

from math import asin, cos, radians, sin, sqrt
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models import NurseProfile, NurseServiceArea
from ..schemas.nurse import NurseCreate, NurseServiceAreaPayload, NurseUpdate


class NurseError(ValueError):
    pass


def _normalize_languages(languages: list[str] | None) -> list[str]:
    return [language.strip() for language in languages or [] if language.strip()]


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc


def _ensure_mutation_access(principal: Principal, profile: NurseProfile | None = None) -> None:
    if principal.role not in {"nurse", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "nurse access required")
    if profile is not None and principal.role != "admin" and profile.user_id != _principal_uuid(principal):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only manage your own nurse profile")


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0
    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)
    a = sin(delta_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(delta_lon / 2) ** 2
    return 2 * earth_radius_km * asin(sqrt(a))


async def create_nurse_profile(db: AsyncSession, principal: Principal, payload: NurseCreate) -> NurseProfile:
    _ensure_mutation_access(principal)
    existing = await db.scalar(select(NurseProfile).where(NurseProfile.user_id == _principal_uuid(principal)))
    if existing:
        raise NurseError("nurse profile already exists")

    profile = NurseProfile(
        user_id=_principal_uuid(principal),
        first_name=payload.first_name,
        last_name=payload.last_name,
        specialty=payload.specialty,
        bio=_normalize_text(payload.bio),
        languages=_normalize_languages(payload.languages),
        home_visit_fee_cents=payload.home_visit_fee_cents,
        photo_url=_normalize_text(payload.photo_url),
        is_listable=payload.is_listable,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile


async def list_nurse_profiles(
    db: AsyncSession,
    *,
    q: str | None = None,
    specialty: str | None = None,
    only_listable: bool = True,
    within_km: float | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> list[NurseProfile]:
    stmt = select(NurseProfile).where(NurseProfile.is_active.is_(True))
    if only_listable:
        stmt = stmt.where(NurseProfile.is_listable.is_(True))
    if specialty:
        stmt = stmt.where(NurseProfile.specialty.ilike(f"%{specialty}%"))
    # Free-text search across name + specialty + bio. Same contract as
    # /v1/doctors. See doctor_service.profile_service for the rationale.
    if q:
        needle = f"%{q.strip()}%"
        if needle != "%%":
            stmt = stmt.where(
                or_(
                    NurseProfile.first_name.ilike(needle),
                    NurseProfile.last_name.ilike(needle),
                    NurseProfile.specialty.ilike(needle),
                    NurseProfile.bio.ilike(needle),
                )
            )
    stmt = stmt.order_by(NurseProfile.last_name.asc(), NurseProfile.first_name.asc())
    result = await db.scalars(stmt)
    nurses = list(result.all())

    if within_km is not None:
        if latitude is None or longitude is None:
            raise NurseError("latitude and longitude are required when within_km is set")
        filtered: list[NurseProfile] = []
        for nurse in nurses:
            area = await db.scalar(select(NurseServiceArea).where(NurseServiceArea.nurse_id == nurse.id, NurseServiceArea.is_active.is_(True)))
            if not area or area.service_area_type != "radius" or area.center_latitude is None or area.center_longitude is None or area.radius_km is None:
                continue
            distance = _haversine_km(latitude, longitude, area.center_latitude, area.center_longitude)
            if distance <= min(within_km, area.radius_km):
                filtered.append(nurse)
        return filtered

    return nurses


async def get_nurse_profile(db: AsyncSession, nurse_id: UUID) -> NurseProfile:
    profile = await db.get(NurseProfile, nurse_id)
    if not profile or not profile.is_active:
        raise NurseError("nurse profile not found")
    return profile


async def update_nurse_profile(db: AsyncSession, principal: Principal, nurse_id: UUID, payload: NurseUpdate) -> NurseProfile:
    profile = await get_nurse_profile(db, nurse_id)
    _ensure_mutation_access(principal, profile)

    updates = payload.model_dump(exclude_unset=True)
    if "languages" in updates and updates["languages"] is not None:
        updates["languages"] = _normalize_languages(updates["languages"])
    for key, value in updates.items():
        setattr(profile, key, value)

    await db.flush()
    await db.refresh(profile)
    return profile


async def delete_nurse_profile(db: AsyncSession, principal: Principal, nurse_id: UUID) -> None:
    profile = await get_nurse_profile(db, nurse_id)
    _ensure_mutation_access(principal, profile)
    await db.delete(profile)
    await db.flush()


async def replace_service_area(db: AsyncSession, principal: Principal, nurse_id: UUID, payload: NurseServiceAreaPayload) -> NurseServiceArea:
    profile = await get_nurse_profile(db, nurse_id)
    _ensure_mutation_access(principal, profile)

    area = await db.scalar(select(NurseServiceArea).where(NurseServiceArea.nurse_id == nurse_id))
    if area is None:
        area = NurseServiceArea(nurse_id=nurse_id)
        db.add(area)

    area.service_area_type = payload.service_area_type
    area.center_latitude = payload.center_latitude
    area.center_longitude = payload.center_longitude
    area.radius_km = payload.radius_km
    area.polygon_geojson = payload.polygon_geojson
    area.notes = _normalize_text(payload.notes)
    area.is_active = True

    await db.flush()
    await db.refresh(area)
    return area
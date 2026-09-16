from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from shared.audit import audited_collection_read
from shared.auth import Principal
from sqlalchemy import cast, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AccessAudit, HospitalProfile, HospitalReview, HospitalStaff, StaffRole
from ..schemas.hospital import HospitalCreate, HospitalStaffCreate


class HospitalError(ValueError):
    pass


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc


def _require_admin(principal: Principal) -> None:
    if principal.role not in {"hospital_admin", "admin", "platform_admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin access required")


def _require_staff_writer(principal: Principal, hospital: HospitalProfile) -> None:
    if not _may_manage_hospital(principal, hospital):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin access required")


def _may_manage_hospital(principal: Principal, hospital: HospitalProfile) -> bool:
    return principal.role in {"admin", "platform_admin"} or (
        hospital.owner_user_id == _principal_uuid(principal) and hospital.is_active
    )


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


async def create_hospital(
    db: AsyncSession, principal: Principal, payload: HospitalCreate
) -> HospitalProfile:
    _require_admin(principal)
    hospital = HospitalProfile(
        owner_user_id=_principal_uuid(principal),
        is_listable=True,
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
    q: str | None = None,
    specialty: str | None = None,
    insurance: str | None = None,
    city: str | None = None,
    country: str | None = None,
) -> list[HospitalProfile]:
    stmt = select(HospitalProfile).where(
        HospitalProfile.is_active.is_(True), HospitalProfile.is_listable.is_(True)
    )
    if specialty:
        stmt = stmt.where(HospitalProfile.specialty.ilike(f"%{specialty.strip()}%"))
    if city:
        stmt = stmt.where(HospitalProfile.city.ilike(f"%{city.strip()}%"))
    if country:
        stmt = stmt.where(HospitalProfile.country.ilike(f"%{country.strip()}%"))
    if insurance:
        insurers = (
            (
                func.jsonb_array_elements_text(cast(HospitalProfile.insurance_accepted, JSONB))
                if db.bind.dialect.name == "postgresql"
                else func.json_each(HospitalProfile.insurance_accepted)
            )
            .table_valued("value")
            .alias("accepted_insurers")
        )
        stmt = stmt.where(
            select(insurers.c.value)
            .where(func.lower(insurers.c.value) == insurance.strip().lower())
            .exists()
        )
    # Free-text search added for the Find-Care wiring (plan
    # merry-seeking-gem). Case-insensitive substring across the
    # fields a patient is most likely to type.
    if q:
        needle = f"%{q.strip()}%"
        if needle != "%%":
            stmt = stmt.where(
                or_(
                    HospitalProfile.name.ilike(needle),
                    HospitalProfile.description.ilike(needle),
                    HospitalProfile.specialty.ilike(needle),
                    HospitalProfile.city.ilike(needle),
                )
            )
    stmt = stmt.order_by(HospitalProfile.name.asc())
    result = await db.scalars(stmt)
    return list(result.all())


async def get_hospital(db: AsyncSession, hospital_id: UUID) -> HospitalProfile:
    hospital = await db.get(HospitalProfile, hospital_id)
    if hospital is None or not hospital.is_active or not hospital.is_listable:
        raise HospitalError("hospital not found")
    return hospital


async def add_staff_member(
    db: AsyncSession, principal: Principal, hospital_id: UUID, payload: HospitalStaffCreate
) -> HospitalStaff:
    hospital = await db.get(HospitalProfile, hospital_id)
    if hospital is None:
        raise HospitalError("hospital not found")
    _require_staff_writer(principal, hospital)
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


async def may_see_staff_user_ids(db: AsyncSession, principal: Principal, hospital_id: UUID) -> bool:
    """Whether this caller gets `user_id` on roster rows.

    Only this hospital's active owner or a platform administrator can manage
    its roster and see account IDs. Other authenticated readers get a narrower
    projection for publicly listed hospitals.
    """
    hospital = await db.get(HospitalProfile, hospital_id)
    return hospital is not None and _may_manage_hospital(principal, hospital)


async def list_staff(
    db: AsyncSession, principal: Principal, hospital_id: UUID
) -> list[HospitalStaff]:
    """Active staff of one hospital, for an AUTHENTICATED caller.

    THE ACCESS RULE, AND WHY IT IS NOT PUBLIC
    -----------------------------------------
    Any authenticated principal may read an active, publicly listed hospital's
    roster; private rosters require the owner or a platform administrator.
    Anonymous callers may not read rosters. That is stricter than sibling reads
    (`GET /v1/hospitals`, `/{id}`, `/{id}/reviews` are all public) and the
    difference is deliberate. Those return facts about an institution. This
    returns a list of people and where each of them works, which is personal
    data under Act 843 even without names attached — an employment graph, and a
    ready-made target list for anyone phoning a hospital pretending to be a
    colleague. Requiring a token does not make the data secret, but it makes
    every read attributable to an identified account, which is the precondition
    for the access log this system still owes (see PIPELINE entry) and it stops
    anonymous bulk scraping of every hospital in the directory.

    It is NOT narrowed to the hospital's own staff or admins: a patient
    choosing a facility has a legitimate purpose for seeing which departments
    and roles it staffs, that is what the `hospital_detail` frame shows, and a
    rule of "only insiders may look" would leave that screen permanently empty
    for the people it was designed for.

    Two further minimisations, both enforced here rather than left to callers:
      * inactive rows are excluded — a former employee's placement at a
        hospital is history, not a current fact, and nothing on the screen needs
        it. Admins do not get an override; a leavers list is a different
        endpoint with a different purpose.
      * `user_id` is filtered at the serialisation boundary by
        `may_see_staff_user_ids`.

    Raises `HospitalError` for an unknown hospital, so the router can answer 404
    instead of an empty roster. Public review reads also require a visible,
    existing hospital.

    AUDITED — this is the access log the docstring above promised and could not
    yet point at. Requiring a token made every read attributable; this makes it
    recorded.

    The row carries `patient_id = NULL`, deliberately. There is no patient here:
    the data subjects are the staff, and the hospital is an institution, not a
    data subject. `resource_id` is the hospital and `record_count` is the size
    of the roster handed over — which is the number that matters for this
    endpoint, because the risk it carries is bulk enumeration of an employment
    graph, not the exposure of one clinical record. `accessor_user_id` plus
    `created_at` is what turns "someone scraped the directory" into a name and a
    timestamp.
    """
    async with audited_collection_read(
        db, AccessAudit, principal, "hospital_staff_roster", resource_id=hospital_id
    ) as audit:
        if not principal.role:
            # Defensive: an unauthenticated caller cannot reach here (the router
            # depends on `get_current_principal`), but a role-less principal must
            # never fall through to a successful read. Inside the audited block,
            # so the refusal is recorded rather than merely returned.
            raise HTTPException(status.HTTP_403_FORBIDDEN, "authentication required")

        hospital = await db.get(HospitalProfile, hospital_id)
        if hospital is None:
            # Outside the audit trail by design: `HospitalError` is not a
            # denial, and a roster that does not exist was not disclosed.
            raise HospitalError("hospital not found")
        if (not hospital.is_active or not hospital.is_listable) and not _may_manage_hospital(
            principal, hospital
        ):
            raise HTTPException(404, "hospital not found")

        stmt = (
            select(HospitalStaff)
            .where(HospitalStaff.hospital_id == hospital_id)
            .where(HospitalStaff.is_active.is_(True))
            # Stable ordering so a client can diff two reads: role groups the list
            # the way the frame renders it, created_at breaks ties deterministically.
            .order_by(HospitalStaff.role.asc(), HospitalStaff.created_at.asc())
        )
        result = await db.scalars(stmt)
        staff = list(result.all())
        audit.record_count = len(staff)
        # Platform access to a private roster uses the administrative override.
        # Projection width on public rosters alone is not an override.
        audit.admin_override = (
            principal.role in {"admin", "platform_admin"}
            and (not hospital.is_active or not hospital.is_listable)
            and hospital.owner_user_id != _principal_uuid(principal)
        )
    return staff


async def list_reviews(db: AsyncSession, hospital_id: UUID) -> list[HospitalReview]:
    await get_hospital(db, hospital_id)
    stmt = (
        select(HospitalReview)
        .where(HospitalReview.hospital_id == hospital_id)
        .where(HospitalReview.is_public.is_(True))
        .order_by(HospitalReview.created_at.desc())
    )
    result = await db.scalars(stmt)
    return list(result.all())

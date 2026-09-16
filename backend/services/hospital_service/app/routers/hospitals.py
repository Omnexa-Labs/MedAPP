from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..deps import DbSession, get_current_principal
from ..schemas.hospital import (
    HospitalCreate,
    HospitalList,
    HospitalOut,
    HospitalReviewOut,
    HospitalStaffCreate,
    HospitalStaffOut,
    HospitalStaffRoster,
    HospitalStaffRosterEntry,
)
from ..services import (
    HospitalError,
    add_staff_member,
    create_hospital,
    get_hospital,
    list_hospitals,
    list_reviews,
    list_staff,
    may_see_staff_user_ids,
)

# Sent in-band on every roster response. A constant, not a formatted string, so
# a client can branch on it if it ever needs to; the human-readable text is the
# point. Kept free of any hint that names are retrievable elsewhere — that would
# read as an invitation to go scrape doctor_service.
NAMES_UNAVAILABLE_REASON = (
    "hospital_service stores only a user reference for each staff member; "
    "display names are not published by this endpoint"
)

router = APIRouter(prefix="/v1/hospitals", tags=["Hospital"])


@router.post("", response_model=HospitalOut, status_code=status.HTTP_201_CREATED)
async def create(payload: HospitalCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        hospital = await create_hospital(db, principal, payload)
    except HospitalError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return HospitalOut.model_validate(hospital)


@router.get("", response_model=HospitalList)
async def index(
    q: str | None = None,
    specialty: str | None = None,
    insurance: str | None = None,
    city: str | None = None,
    country: str | None = None,
    db: AsyncSession = DbSession,
):
    hospitals = await list_hospitals(
        db, q=q, specialty=specialty, insurance=insurance, city=city, country=country,
    )
    return HospitalList(items=[HospitalOut.model_validate(hospital) for hospital in hospitals])


@router.get("/{hospital_id}", response_model=HospitalOut)
async def read(hospital_id: UUID, db: AsyncSession = DbSession):
    try:
        hospital = await get_hospital(db, hospital_id)
    except HospitalError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return HospitalOut.model_validate(hospital)


@router.post("/{hospital_id}/staff", response_model=HospitalStaffOut, status_code=status.HTTP_201_CREATED)
async def add_staff(hospital_id: UUID, payload: HospitalStaffCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        staff = await add_staff_member(db, principal, hospital_id, payload)
    except HospitalError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return HospitalStaffOut.model_validate(
        {
            "staff_id": staff.id,
            "hospital_id": staff.hospital_id,
            "user_id": staff.user_id,
            "role": staff.role,
            "title": staff.title,
            "department": staff.department,
            "is_active": staff.is_active,
            "created_at": staff.created_at,
            "updated_at": staff.updated_at,
        }
    )


@router.get("/{hospital_id}/staff", response_model=HospitalStaffRoster)
async def read_staff(
    hospital_id: UUID,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    """The hospital's active staff roster.

    Authenticated callers only — unlike the other reads on this router, which
    are public. The reasoning is in `list_staff`'s docstring; the short version
    is that this response is a list of people, not facts about a building.

    `hospital_id` is in the PATH, not a query string, so it does not land in
    access logs or proxy query-string capture. It is a hospital identifier
    rather than a personal one, so a path segment is acceptable here; no staff
    or patient identifier appears anywhere in the request.

    Nothing about the roster is logged. A log line naming the hospital and the
    reader would be the beginning of the access trail this service still lacks,
    but half of one — written to application logs with no retention policy and
    no way to query it per data subject — is worse than none, so it waits for
    the real audit store.
    """
    try:
        staff = await list_staff(db, principal, hospital_id)
    except HospitalError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

    expose_user_ids = await may_see_staff_user_ids(db, principal, hospital_id)
    return HospitalStaffRoster(
        items=[
            HospitalStaffRosterEntry.model_validate(
                {
                    "staff_id": member.id,
                    "hospital_id": member.hospital_id,
                    "role": member.role,
                    "title": member.title,
                    "department": member.department,
                    # Withheld from ordinary readers. Built explicitly rather
                    # than by `exclude=` on the dump so that the decision is
                    # visible at the point the field is produced.
                    "user_id": member.user_id if expose_user_ids else None,
                }
            )
            for member in staff
        ],
        names_available=False,
        names_unavailable_reason=NAMES_UNAVAILABLE_REASON,
        includes_user_ids=expose_user_ids,
    )


@router.get("/{hospital_id}/reviews", response_model=list[HospitalReviewOut])
async def read_reviews(hospital_id: UUID, db: AsyncSession = DbSession):
    try:
        reviews = await list_reviews(db, hospital_id)
    except HospitalError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return [
        HospitalReviewOut.model_validate(
            {
                "review_id": review.id,
                "hospital_id": review.hospital_id,
                "reviewer_user_id": review.reviewer_user_id,
                "rating": review.rating,
                "title": review.title,
                "body": review.body,
                "is_public": review.is_public,
                "moderation_status": review.moderation_status,
                "created_at": review.created_at,
                "updated_at": review.updated_at,
            }
        )
        for review in reviews
    ]

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..deps import DbSession, get_current_principal
from ..schemas.hospital import HospitalCreate, HospitalList, HospitalOut, HospitalReviewOut, HospitalStaffCreate, HospitalStaffOut
from ..services import HospitalError, add_staff_member, create_hospital, get_hospital, list_hospitals, list_reviews

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


@router.get("/{hospital_id}/reviews", response_model=list[HospitalReviewOut])
async def read_reviews(hospital_id: UUID, db: AsyncSession = DbSession):
    reviews = await list_reviews(db, hospital_id)
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
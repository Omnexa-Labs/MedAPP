from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..deps import DbSession, get_current_principal
from ..schemas.nurse import NurseCreate, NurseList, NurseOut, NurseServiceAreaOut, NurseServiceAreaPayload, NurseUpdate
from ..services import NurseError, create_nurse_profile, delete_nurse_profile, get_nurse_profile, list_nurse_profiles, replace_service_area, update_nurse_profile

router = APIRouter(prefix="/v1/nurses", tags=["Nurse"])


@router.post("", response_model=NurseOut, status_code=status.HTTP_201_CREATED)
async def create(payload: NurseCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        profile = await create_nurse_profile(db, principal, payload)
    except NurseError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return NurseOut.model_validate(profile)


@router.get("", response_model=NurseList)
async def index(
    q: str | None = None,
    specialty: str | None = None,
    only_listable: bool = True,
    within_km: float | None = Query(default=None, ge=0),
    latitude: float | None = None,
    longitude: float | None = None,
    db: AsyncSession = DbSession,
):
    try:
        profiles = await list_nurse_profiles(
            db,
            q=q,
            specialty=specialty,
            only_listable=only_listable,
            within_km=within_km,
            latitude=latitude,
            longitude=longitude,
        )
    except NurseError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return NurseList(items=[NurseOut.model_validate(profile) for profile in profiles])


@router.get("/{nurse_id}", response_model=NurseOut)
async def read(nurse_id: UUID, db: AsyncSession = DbSession):
    try:
        profile = await get_nurse_profile(db, nurse_id)
    except NurseError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return NurseOut.model_validate(profile)


@router.patch("/{nurse_id}", response_model=NurseOut)
async def update(nurse_id: UUID, payload: NurseUpdate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        profile = await update_nurse_profile(db, principal, nurse_id, payload)
    except NurseError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return NurseOut.model_validate(profile)


@router.delete("/{nurse_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(nurse_id: UUID, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        await delete_nurse_profile(db, principal, nurse_id)
    except NurseError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.post("/{nurse_id}/service_area", response_model=NurseServiceAreaOut)
async def set_service_area(nurse_id: UUID, payload: NurseServiceAreaPayload, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        area = await replace_service_area(db, principal, nurse_id, payload)
    except NurseError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return NurseServiceAreaOut.model_validate(area)
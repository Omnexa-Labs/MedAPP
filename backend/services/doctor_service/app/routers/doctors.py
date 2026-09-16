from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal, get_current_principal

from ..deps import DbSession
from ..schemas.availability import AvailabilityRulesPayload, AvailabilityRuleOut
from ..schemas.availability_response import SlotListResponse, AvailabilityRulesResponse
from ..schemas.doctor import DoctorCreate, DoctorList, DoctorProfileOut, DoctorUpdate
from ..services import (
    AvailabilityError,
    DoctorProfileError,
    create_doctor_profile,
    delete_doctor_profile,
    compute_slots,
    list_availability_rules,
    get_doctor_profile,
    list_doctor_profiles,
    replace_availability_rules,
    update_doctor_profile,
)

from ..services.self_profile import get_self_profile

router = APIRouter(prefix="/v1/doctors", tags=["Doctor"])


def _can_mutate(principal: Principal) -> None:
    if principal.role not in {"doctor", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "doctor access required")


def _doctor_or_admin(principal: Principal) -> None:
    if principal.role not in {"doctor", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "doctor access required")


@router.post("", response_model=DoctorProfileOut, status_code=status.HTTP_201_CREATED)
async def create(
    payload: DoctorCreate,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> DoctorProfileOut:
    _can_mutate(principal)
    try:
        profile = await create_doctor_profile(db, principal, payload)
    except DoctorProfileError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return DoctorProfileOut.model_validate(profile)


@router.get("", response_model=DoctorList)
async def index(
    q: str | None = None,
    specialty: str | None = None,
    only_listable: bool = True,
    db: AsyncSession = DbSession,
) -> DoctorList:
    profiles = await list_doctor_profiles(
        db, q=q, specialty=specialty, only_listable=only_listable,
    )
    return DoctorList(items=[DoctorProfileOut.model_validate(profile) for profile in profiles])


@router.get("/me", response_model=DoctorProfileOut)
async def read_self(
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    return DoctorProfileOut.model_validate(await get_self_profile(db, principal))


@router.patch("/me", response_model=DoctorProfileOut)
async def update_self(
    payload: DoctorUpdate,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    profile = await get_self_profile(db, principal)
    if not profile.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "professional profile is inactive")
    try:
        profile = await update_doctor_profile(db, principal, profile.id, payload)
    except DoctorProfileError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return DoctorProfileOut.model_validate(profile)


@router.get("/{doctor_id}", response_model=DoctorProfileOut)
async def read(doctor_id: UUID, db: AsyncSession = DbSession) -> DoctorProfileOut:
    try:
        profile = await get_doctor_profile(db, doctor_id)
    except DoctorProfileError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return DoctorProfileOut.model_validate(profile)


@router.patch("/{doctor_id}", response_model=DoctorProfileOut)
async def update(
    doctor_id: UUID,
    payload: DoctorUpdate,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> DoctorProfileOut:
    _can_mutate(principal)
    try:
        profile = await update_doctor_profile(db, principal, doctor_id, payload)
    except DoctorProfileError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return DoctorProfileOut.model_validate(profile)


@router.delete("/{doctor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    doctor_id: UUID,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> None:
    _can_mutate(principal)
    try:
        await delete_doctor_profile(db, principal, doctor_id)
    except DoctorProfileError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.put("/{doctor_id}/availability", response_model=AvailabilityRulesResponse)
async def replace_availability(
    doctor_id: UUID,
    payload: AvailabilityRulesPayload,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> AvailabilityRulesResponse:
    _doctor_or_admin(principal)
    try:
        rules = await replace_availability_rules(db, principal, doctor_id, payload.items)
    except AvailabilityError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return AvailabilityRulesResponse(
        items=[
            AvailabilityRuleOut.model_validate(
                {
                    "rule_id": rule.id,
                    "doctor_id": rule.doctor_id,
                    "day_of_week": rule.day_of_week,
                    "start_time": rule.start_time,
                    "end_time": rule.end_time,
                    "timezone": rule.timezone,
                    "is_active": rule.is_active,
                }
            )
            for rule in rules
        ]
    )


@router.get("/{doctor_id}/availability", response_model=AvailabilityRulesResponse)
async def read_availability(doctor_id: UUID, db: AsyncSession = DbSession) -> AvailabilityRulesResponse:
    rules = await list_availability_rules(db, doctor_id)
    return AvailabilityRulesResponse(
        items=[
            AvailabilityRuleOut.model_validate(
                {
                    "rule_id": rule.id,
                    "doctor_id": rule.doctor_id,
                    "day_of_week": rule.day_of_week,
                    "start_time": rule.start_time,
                    "end_time": rule.end_time,
                    "timezone": rule.timezone,
                    "is_active": rule.is_active,
                }
            )
            for rule in rules
        ]
    )


@router.get("/{doctor_id}/slots", response_model=SlotListResponse)
async def slots(
    doctor_id: UUID,
    from_date: date,
    to_date: date,
    slot_minutes: int = 30,
    db: AsyncSession = DbSession,
) -> SlotListResponse:
    try:
        items = await compute_slots(db, doctor_id, from_date, to_date, slot_minutes)
    except AvailabilityError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return SlotListResponse(items=items)
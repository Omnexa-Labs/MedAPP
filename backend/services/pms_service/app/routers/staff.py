from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import DbSession, require_roles
from ..models.core import Staff
from ..schemas.staff import StaffCreate, StaffList, StaffOut, StaffUpdate
from ..services import auth_service

router = APIRouter(prefix="/v1/staff", tags=["staff"])

ADMIN_ONLY = ("pharmacy_admin",)
ALL_STAFF = ("pharmacy_admin", "pharmacist", "cashier")


@router.get("", response_model=StaffList)
async def list_staff(
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL_STAFF)),
):
    rows = (await db.execute(select(Staff).order_by(Staff.full_name))).scalars().all()
    return StaffList(items=[StaffOut.model_validate(r) for r in rows])


@router.post("", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
async def create_staff(
    body: StaffCreate,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ADMIN_ONLY)),
):
    existing = (
        await db.execute(select(Staff).where(Staff.email == body.email.lower()))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already in use")
    s = Staff(
        full_name=body.full_name,
        email=body.email.lower(),
        phone=body.phone,
        role=body.role,
        password_hash=auth_service.hash_password(body.password),
        is_active=True,
    )
    db.add(s)
    await db.flush()
    return StaffOut.model_validate(s)


@router.patch("/{staff_id}", response_model=StaffOut)
async def update_staff(
    staff_id: UUID,
    body: StaffUpdate,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ADMIN_ONLY)),
):
    s = (await db.execute(select(Staff).where(Staff.id == staff_id))).scalar_one_or_none()
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "staff not found")
    if body.full_name is not None:
        s.full_name = body.full_name
    if body.phone is not None:
        s.phone = body.phone
    if body.role is not None:
        s.role = body.role
    if body.is_active is not None:
        s.is_active = body.is_active
    if body.password is not None:
        s.password_hash = auth_service.hash_password(body.password)
    await db.flush()
    return StaffOut.model_validate(s)


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_staff(
    staff_id: UUID,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ADMIN_ONLY)),
):
    s = (await db.execute(select(Staff).where(Staff.id == staff_id))).scalar_one_or_none()
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "staff not found")
    s.is_active = False
    await db.flush()

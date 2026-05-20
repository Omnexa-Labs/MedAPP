from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import HmsPrincipal, get_tenant_db, require_hms_roles
from ..schemas.staff import (
    DepartmentCreate,
    DepartmentList,
    DepartmentOut,
    DepartmentUpdate,
    ScheduleSlotCreate,
    ScheduleSlotOut,
    StaffCreate,
    StaffList,
    StaffOut,
    StaffUpdate,
)
from ..services import staff_service

router = APIRouter(prefix="/v1", tags=["staff"])

ADMIN_ROLES = ("hospital_admin", "department_head")
ALL_STAFF_ROLES = ("hospital_admin", "department_head", "doctor", "nurse", "receptionist", "pharmacist", "billing_clerk")


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
async def create_department(
    body: DepartmentCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*ADMIN_ROLES)),
):
    dept = await staff_service.create_department(body, db)
    return dept


@router.get("/departments", response_model=DepartmentList)
async def list_departments(
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*ALL_STAFF_ROLES)),
):
    depts = await staff_service.list_departments(db)
    return DepartmentList(items=depts)


@router.patch("/departments/{dept_id}", response_model=DepartmentOut)
async def update_department(
    dept_id: UUID,
    body: DepartmentUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*ADMIN_ROLES)),
):
    dept = await staff_service.update_department(dept_id, body, db)
    if dept is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "department not found")
    return dept


@router.post("/staff", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
async def create_staff(
    body: StaffCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*ADMIN_ROLES)),
):
    staff = await staff_service.create_staff(body, db)
    return staff


@router.get("/staff", response_model=StaffList)
async def list_staff(
    search: str | None = Query(default=None, max_length=128),
    department_id: UUID | None = Query(default=None),
    specialty: str | None = Query(default=None, max_length=128),
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*ALL_STAFF_ROLES)),
):
    staff = await staff_service.list_staff(db, search, department_id, specialty)
    return StaffList(items=staff)


@router.get("/staff/{staff_id}", response_model=StaffOut)
async def get_staff(
    staff_id: UUID,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*ALL_STAFF_ROLES)),
):
    staff = await staff_service.get_staff(staff_id, db)
    if staff is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "staff not found")
    return staff


@router.patch("/staff/{staff_id}", response_model=StaffOut)
async def update_staff(
    staff_id: UUID,
    body: StaffUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*ADMIN_ROLES)),
):
    staff = await staff_service.update_staff(staff_id, body, db)
    if staff is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "staff not found")
    return staff


@router.post("/staff/{staff_id}/schedule", response_model=list[ScheduleSlotOut], status_code=status.HTTP_201_CREATED)
async def set_schedule(
    staff_id: UUID,
    body: list[ScheduleSlotCreate],
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*ADMIN_ROLES)),
):
    slots = await staff_service.set_schedule(staff_id, body, db)
    return slots


@router.get("/staff/{staff_id}/schedule", response_model=list[ScheduleSlotOut])
async def get_schedule(
    staff_id: UUID,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*ALL_STAFF_ROLES)),
):
    return await staff_service.get_schedule(staff_id, db)

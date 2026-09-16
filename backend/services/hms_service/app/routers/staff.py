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
ALL_STAFF_ROLES = (
    "hospital_admin",
    "department_head",
    "doctor",
    "nurse",
    "receptionist",
    "pharmacist",
    "billing_clerk",
)

StaffDatabase = Depends(get_tenant_db)
Administrator = Depends(require_hms_roles(*ADMIN_ROLES))
StaffReader = Depends(require_hms_roles(*ALL_STAFF_ROLES))
DepartmentFilter = Query(default=None)


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
async def create_department(
    body: DepartmentCreate,
    db: AsyncSession = StaffDatabase,
    principal: HmsPrincipal = Administrator,
):
    dept = await staff_service.create_department(body, db)
    return dept


@router.get("/departments", response_model=DepartmentList)
async def list_departments(
    db: AsyncSession = StaffDatabase,
    principal: HmsPrincipal = StaffReader,
):
    depts = await staff_service.list_departments(db)
    return DepartmentList(items=depts)


@router.patch("/departments/{dept_id}", response_model=DepartmentOut)
async def update_department(
    dept_id: UUID,
    body: DepartmentUpdate,
    db: AsyncSession = StaffDatabase,
    principal: HmsPrincipal = Administrator,
):
    dept = await staff_service.update_department(dept_id, body, db)
    if dept is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "department not found")
    return dept


@router.post("/staff", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
async def create_staff(
    body: StaffCreate,
    db: AsyncSession = StaffDatabase,
    principal: HmsPrincipal = Administrator,
):
    staff = await staff_service.create_staff(body, db)
    return staff


@router.get("/staff", response_model=StaffList)
async def list_staff(
    search: str | None = Query(default=None, max_length=128),
    department_id: UUID | None = DepartmentFilter,
    specialty: str | None = Query(default=None, max_length=128),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = StaffDatabase,
    principal: HmsPrincipal = StaffReader,
):
    staff = await staff_service.list_staff(db, search, department_id, specialty, limit, offset)
    return StaffList(items=staff[:limit], has_more=len(staff) > limit)


@router.get("/staff/{staff_id}", response_model=StaffOut)
async def get_staff(
    staff_id: UUID,
    db: AsyncSession = StaffDatabase,
    principal: HmsPrincipal = StaffReader,
):
    staff = await staff_service.get_staff(staff_id, db)
    if staff is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "staff not found")
    return staff


@router.patch("/staff/{staff_id}", response_model=StaffOut)
async def update_staff(
    staff_id: UUID,
    body: StaffUpdate,
    db: AsyncSession = StaffDatabase,
    principal: HmsPrincipal = Administrator,
):
    staff = await staff_service.update_staff(staff_id, body, db)
    if staff is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "staff not found")
    return staff


@router.post(
    "/staff/{staff_id}/schedule",
    response_model=list[ScheduleSlotOut],
    status_code=status.HTTP_201_CREATED,
)
async def set_schedule(
    staff_id: UUID,
    body: list[ScheduleSlotCreate],
    db: AsyncSession = StaffDatabase,
    principal: HmsPrincipal = Administrator,
):
    slots = await staff_service.set_schedule(staff_id, body, db)
    return slots


@router.get("/staff/{staff_id}/schedule", response_model=list[ScheduleSlotOut])
async def get_schedule(
    staff_id: UUID,
    db: AsyncSession = StaffDatabase,
    principal: HmsPrincipal = StaffReader,
):
    return await staff_service.get_schedule(staff_id, db)

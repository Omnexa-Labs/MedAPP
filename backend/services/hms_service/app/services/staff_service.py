from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.department import Department, DepartmentMembership
from ..models.staff import StaffMember, StaffSchedule
from ..schemas.staff import (
    DepartmentCreate,
    DepartmentUpdate,
    ScheduleSlotCreate,
    StaffCreate,
    StaffUpdate,
)


async def create_department(body: DepartmentCreate, db: AsyncSession) -> Department:
    dept = Department(
        name=body.name,
        slug=body.slug,
        description=body.description,
        head_staff_id=body.head_staff_id,
    )
    db.add(dept)
    await db.flush()
    return dept


async def list_departments(db: AsyncSession) -> list[Department]:
    result = await db.execute(
        select(Department).where(Department.is_active.is_(True)).order_by(Department.name)
    )
    return list(result.scalars().all())


async def get_department(dept_id: UUID, db: AsyncSession) -> Department | None:
    result = await db.execute(select(Department).where(Department.id == dept_id))
    return result.scalar_one_or_none()


async def update_department(
    dept_id: UUID, body: DepartmentUpdate, db: AsyncSession
) -> Department | None:
    dept = await get_department(dept_id, db)
    if dept is None:
        return None
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(dept, key, value)
    await db.flush()
    await db.refresh(dept, attribute_names=["updated_at"])
    return dept


async def create_staff(body: StaffCreate, db: AsyncSession) -> StaffMember:
    staff = StaffMember(
        user_id=body.user_id,
        employee_id=body.employee_id,
        first_name=body.first_name,
        last_name=body.last_name,
        title=body.title,
        specialty=body.specialty,
        qualification=body.qualification,
        phone=body.phone,
        email=body.email,
    )
    db.add(staff)
    await db.flush()

    if body.department_id:
        membership = DepartmentMembership(
            staff_id=staff.id,
            department_id=body.department_id,
            role_in_department=body.role_in_department,
            is_primary=True,
        )
        db.add(membership)
        await db.flush()

    return staff


async def list_staff(
    db: AsyncSession,
    search: str | None = None,
    department_id: UUID | None = None,
    specialty: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[StaffMember]:
    query = select(StaffMember).where(StaffMember.is_active.is_(True))

    if search:
        like = f"%{search}%"
        query = query.where(
            StaffMember.first_name.ilike(like)
            | StaffMember.last_name.ilike(like)
            | StaffMember.employee_id.ilike(like)
        )

    if specialty:
        query = query.where(StaffMember.specialty.ilike(f"%{specialty}%"))

    if department_id:
        query = query.join(
            DepartmentMembership, DepartmentMembership.staff_id == StaffMember.id
        ).where(DepartmentMembership.department_id == department_id)

    result = await db.execute(
        query.distinct()
        .order_by(StaffMember.last_name, StaffMember.id)
        .offset(offset)
        .limit(limit + 1)
    )
    return list(result.scalars().all())


async def get_staff(staff_id: UUID, db: AsyncSession) -> StaffMember | None:
    result = await db.execute(select(StaffMember).where(StaffMember.id == staff_id))
    return result.scalar_one_or_none()


async def update_staff(staff_id: UUID, body: StaffUpdate, db: AsyncSession) -> StaffMember | None:
    staff = await get_staff(staff_id, db)
    if staff is None:
        return None
    if body.employee_id and await db.scalar(
        select(StaffMember.id).where(
            StaffMember.employee_id == body.employee_id, StaffMember.id != staff_id
        )
    ):
        raise HTTPException(409, "This employee ID already belongs to another staff member.")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(staff, key, value)
    await db.flush()
    await db.refresh(staff, attribute_names=["updated_at"])
    return staff


async def set_schedule(
    staff_id: UUID, slots: list[ScheduleSlotCreate], db: AsyncSession
) -> list[StaffSchedule]:
    created = []
    for slot in slots:
        schedule = StaffSchedule(
            staff_id=staff_id,
            day_of_week=slot.day_of_week,
            start_time=slot.start_time,
            end_time=slot.end_time,
            is_available=slot.is_available,
            effective_from=slot.effective_from,
            effective_until=slot.effective_until,
        )
        db.add(schedule)
        created.append(schedule)
    await db.flush()
    return created


async def get_schedule(staff_id: UUID, db: AsyncSession) -> list[StaffSchedule]:
    result = await db.execute(
        select(StaffSchedule)
        .where(StaffSchedule.staff_id == staff_id)
        .order_by(StaffSchedule.day_of_week, StaffSchedule.start_time)
    )
    return list(result.scalars().all())

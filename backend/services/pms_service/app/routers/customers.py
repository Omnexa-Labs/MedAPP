from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import DbSession, require_roles
from ..models.core import Customer
from ..schemas.customers import (
    CustomerCreate,
    CustomerList,
    CustomerOut,
    CustomerUpdate,
)

router = APIRouter(prefix="/v1/customers", tags=["customers"])

ALL = ("pharmacy_admin", "pharmacist", "cashier")
EDIT = ("pharmacy_admin", "pharmacist", "cashier")


@router.get("", response_model=CustomerList)
async def list_customers(
    q: str | None = Query(default=None, description="search by name or phone"),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(Customer).order_by(Customer.full_name)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Customer.full_name.ilike(like), Customer.phone.ilike(like)))
    rows = (await db.execute(stmt)).scalars().all()
    return CustomerList(items=[CustomerOut.model_validate(c) for c in rows])


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*EDIT)),
):
    c = Customer(**body.model_dump())
    db.add(c)
    await db.flush()
    return CustomerOut.model_validate(c)


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(
    customer_id: UUID,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    c = (await db.execute(select(Customer).where(Customer.id == customer_id))).scalar_one_or_none()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "customer not found")
    return CustomerOut.model_validate(c)


@router.patch("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: UUID,
    body: CustomerUpdate,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*EDIT)),
):
    c = (await db.execute(select(Customer).where(Customer.id == customer_id))).scalar_one_or_none()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "customer not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(c, field, value)
    await db.flush()
    return CustomerOut.model_validate(c)

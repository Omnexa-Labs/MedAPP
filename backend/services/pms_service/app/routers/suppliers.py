from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import DbSession, require_roles
from ..models.core import Supplier
from ..schemas.suppliers import (
    SupplierCreate,
    SupplierList,
    SupplierOut,
    SupplierUpdate,
)

router = APIRouter(prefix="/v1/suppliers", tags=["suppliers"])

ALL = ("pharmacy_admin", "pharmacist", "cashier")
EDIT = ("pharmacy_admin", "pharmacist")


@router.get("", response_model=SupplierList)
async def list_suppliers(
    include_inactive: bool = Query(default=False),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(Supplier).order_by(Supplier.name)
    if not include_inactive:
        stmt = stmt.where(Supplier.is_active.is_(True))
    rows = (await db.execute(stmt)).scalars().all()
    return SupplierList(items=[SupplierOut.model_validate(s) for s in rows])


@router.post("", response_model=SupplierOut, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    body: SupplierCreate,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*EDIT)),
):
    s = Supplier(**body.model_dump())
    db.add(s)
    await db.flush()
    return SupplierOut.model_validate(s)


@router.patch("/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: UUID,
    body: SupplierUpdate,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*EDIT)),
):
    s = (
        await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    ).scalar_one_or_none()
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "supplier not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    await db.flush()
    return SupplierOut.model_validate(s)

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import DbSession, require_roles
from ..models.core import Prescription
from ..schemas.reports import (
    DailySalesSeries,
    DashboardOverview,
    DispensingVolume,
    MovementBreakdownList,
    SalesSummary,
    StockValuation,
    TopDrugList,
)
from ..services import inventory_service, reports_service

router = APIRouter(prefix="/v1/reports", tags=["reports"])

ALL = ("pharmacy_admin", "pharmacist", "cashier")
ADMIN = ("pharmacy_admin", "pharmacist")


@router.get("/dashboard")
async def dashboard(
    period: Literal["today", "week"] = "today", db=DbSession, _=Depends(require_roles(*ALL))
):
    from ..services.dashboard import dashboard as load_dashboard

    return await load_dashboard(db, period)


@router.get("/sales-summary", response_model=SalesSummary)
async def sales_summary(
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    return SalesSummary(**await reports_service.sales_summary(db, start, end))


@router.get("/sales-daily", response_model=DailySalesSeries)
async def sales_daily(
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    items = await reports_service.daily_sales_series(db, start, end)
    return DailySalesSeries(items=items)


@router.get("/top-drugs", response_model=TopDrugList)
async def top_drugs(
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=100),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    items = await reports_service.top_selling_drugs(db, start, end, limit)
    return TopDrugList(items=items)


@router.get("/dispensing", response_model=DispensingVolume)
async def dispensing(
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    return DispensingVolume(**await reports_service.dispensing_volume(db, start, end))


@router.get("/movements", response_model=MovementBreakdownList)
async def movements(
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ADMIN)),
):
    items = await reports_service.movement_breakdown(db, start, end)
    return MovementBreakdownList(items=items)


@router.get("/stock-valuation", response_model=StockValuation)
async def stock_valuation(
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ADMIN)),
):
    return StockValuation(**await inventory_service.stock_valuation(db))


@router.get("/overview", response_model=DashboardOverview)
async def overview(
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    summary = await reports_service.sales_summary(db)
    valuation = await inventory_service.stock_valuation(db)
    low_stock = await inventory_service.low_stock_alerts(db)
    expiring = await inventory_service.expiring_soon(db, days=90)
    pending = (
        await db.execute(
            select(func.count(Prescription.id)).where(
                Prescription.status.in_(("pending", "partially_dispensed"))
            )
        )
    ).scalar_one()
    return DashboardOverview(
        sales_summary=SalesSummary(**summary),
        stock_valuation=StockValuation(**valuation),
        low_stock_count=len(low_stock),
        expiring_soon_count=len(expiring),
        pending_prescriptions=int(pending),
    )

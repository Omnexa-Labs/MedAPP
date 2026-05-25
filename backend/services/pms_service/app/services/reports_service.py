"""Aggregated read models for the reports dashboard."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.core import Drug, Prescription, Sale, SaleItem, StockMovement


def _range(start: date | None, end: date | None) -> tuple[datetime, datetime]:
    today = date.today()
    end_d = end or today
    start_d = start or (end_d - timedelta(days=29))
    start_dt = datetime.combine(start_d, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_d + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    return start_dt, end_dt


async def sales_summary(
    db: AsyncSession, start: date | None = None, end: date | None = None
) -> dict:
    start_dt, end_dt = _range(start, end)
    stmt = select(
        func.count(Sale.id),
        func.coalesce(func.sum(Sale.total_cents), 0),
        func.coalesce(func.sum(Sale.discount_cents), 0),
    ).where(
        Sale.created_at >= start_dt,
        Sale.created_at < end_dt,
        Sale.status == "completed",
    )
    count, total, discount = (await db.execute(stmt)).one()
    by_method = (
        await db.execute(
            select(
                Sale.payment_method,
                func.count(Sale.id),
                func.coalesce(func.sum(Sale.total_cents), 0),
            )
            .where(
                Sale.created_at >= start_dt,
                Sale.created_at < end_dt,
                Sale.status == "completed",
            )
            .group_by(Sale.payment_method)
        )
    ).all()
    return {
        "start_date": (start or (end or date.today()) - timedelta(days=29)).isoformat(),
        "end_date": (end or date.today()).isoformat(),
        "sale_count": int(count),
        "gross_total_cents": int(total),
        "discount_cents": int(discount),
        "by_payment_method": [
            {"method": m, "count": int(c), "total_cents": int(t)} for m, c, t in by_method
        ],
    }


async def daily_sales_series(
    db: AsyncSession, start: date | None = None, end: date | None = None
) -> list[dict]:
    start_dt, end_dt = _range(start, end)
    day = func.date(Sale.created_at).label("day")
    stmt = (
        select(day, func.count(Sale.id), func.coalesce(func.sum(Sale.total_cents), 0))
        .where(
            Sale.created_at >= start_dt,
            Sale.created_at < end_dt,
            Sale.status == "completed",
        )
        .group_by(day)
        .order_by(day)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {"day": str(d), "sale_count": int(c), "total_cents": int(t)} for d, c, t in rows
    ]


async def top_selling_drugs(
    db: AsyncSession,
    start: date | None = None,
    end: date | None = None,
    limit: int = 10,
) -> list[dict]:
    start_dt, end_dt = _range(start, end)
    stmt = (
        select(
            SaleItem.drug_id,
            SaleItem.drug_name_snapshot,
            func.sum(SaleItem.quantity).label("qty"),
            func.sum(SaleItem.line_total_cents).label("revenue"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(
            Sale.created_at >= start_dt,
            Sale.created_at < end_dt,
            Sale.status == "completed",
        )
        .group_by(SaleItem.drug_id, SaleItem.drug_name_snapshot)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "drug_id": str(drug_id),
            "drug_name": name,
            "units_sold": int(qty),
            "revenue_cents": int(rev),
        }
        for drug_id, name, qty, rev in rows
    ]


async def dispensing_volume(
    db: AsyncSession, start: date | None = None, end: date | None = None
) -> dict:
    start_dt, end_dt = _range(start, end)
    by_status = (
        await db.execute(
            select(Prescription.status, func.count(Prescription.id))
            .where(Prescription.created_at >= start_dt, Prescription.created_at < end_dt)
            .group_by(Prescription.status)
        )
    ).all()
    by_source = (
        await db.execute(
            select(Prescription.source, func.count(Prescription.id))
            .where(Prescription.created_at >= start_dt, Prescription.created_at < end_dt)
            .group_by(Prescription.source)
        )
    ).all()
    return {
        "by_status": [{"status": s, "count": int(c)} for s, c in by_status],
        "by_source": [{"source": s, "count": int(c)} for s, c in by_source],
    }


async def movement_breakdown(
    db: AsyncSession, start: date | None = None, end: date | None = None
) -> list[dict]:
    start_dt, end_dt = _range(start, end)
    stmt = (
        select(
            StockMovement.reason,
            func.count(StockMovement.id),
            func.coalesce(func.sum(StockMovement.delta), 0),
        )
        .where(StockMovement.created_at >= start_dt, StockMovement.created_at < end_dt)
        .group_by(StockMovement.reason)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {"reason": reason, "movement_count": int(c), "net_units": int(net)}
        for reason, c, net in rows
    ]

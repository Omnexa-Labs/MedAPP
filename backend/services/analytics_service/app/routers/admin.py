from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..deps import DbSession, get_current_principal
from ..schemas.analytics import DoctorScorecardOut, FunnelMetricsOut, RetentionMetricsOut
from ..services import build_doctor_scorecard, build_funnel_metrics, build_retention_metrics

router = APIRouter(prefix="/v1/admin", tags=["Analytics"])


def _ensure_admin(principal: Principal) -> None:
    if principal.role not in {"admin", "platform_admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin access required")


@router.get("/metrics/funnel", response_model=FunnelMetricsOut)
async def funnel(
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    _ensure_admin(principal)
    return await build_funnel_metrics(db, start_date=from_date, end_date=to_date)


@router.get("/metrics/retention", response_model=RetentionMetricsOut)
async def retention(
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    _ensure_admin(principal)
    return await build_retention_metrics(db, start_date=from_date, end_date=to_date)


@router.get("/doctors/{doctor_id}/scorecard", response_model=DoctorScorecardOut)
async def scorecard(
    doctor_id: UUID,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    _ensure_admin(principal)
    return await build_doctor_scorecard(db, doctor_id)
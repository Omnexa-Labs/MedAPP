from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import HmsPrincipal, get_tenant_db, require_hms_roles
from ..schemas.dashboard import DashboardSummaryOut
from ..services import dashboard_service

router = APIRouter(prefix="/v1", tags=["dashboard"])

ALL_ROLES = ("hospital_admin", "department_head", "doctor", "nurse", "receptionist", "pharmacist", "billing_clerk")


@router.get("/dashboard/summary", response_model=DashboardSummaryOut)
async def dashboard_summary(
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*ALL_ROLES)),
):
    summary = await dashboard_service.get_dashboard_summary(db)
    return DashboardSummaryOut(**summary)

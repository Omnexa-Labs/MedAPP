from __future__ import annotations

from pydantic import BaseModel, Field

from .pharmacy import StockAlertOut


class DashboardSummaryOut(BaseModel):
    patients_registered_today: int = 0
    total_patients: int = 0
    appointments_today: int = 0
    appointments_completed_today: int = 0
    queue_waiting: int = 0
    queue_serving: int = 0
    revenue_today_cents: int = 0
    revenue_this_month_cents: int = 0
    currency: str = "GHS"
    low_stock_count: int = 0
    stock_alerts: list[StockAlertOut] = Field(default_factory=list)

from __future__ import annotations

from pydantic import BaseModel


class PaymentMethodBreakdown(BaseModel):
    method: str
    count: int
    total_cents: int


class SalesSummary(BaseModel):
    currency: str = "GHS"
    start_date: str
    end_date: str
    sale_count: int
    gross_total_cents: int
    discount_cents: int
    credit_total_cents: int = 0
    refund_total_cents: int = 0
    net_sales_cents: int = 0
    by_payment_method: list[PaymentMethodBreakdown]


class DailySalesPoint(BaseModel):
    day: str
    sale_count: int
    total_cents: int
    credit_cents: int = 0
    refund_cents: int = 0
    net_sales_cents: int = 0


class DailySalesSeries(BaseModel):
    items: list[DailySalesPoint]


class TopDrug(BaseModel):
    drug_id: str
    drug_name: str
    units_sold: int
    revenue_cents: int


class TopDrugList(BaseModel):
    items: list[TopDrug]


class CountByKey(BaseModel):
    key: str
    count: int


class DispensingVolume(BaseModel):
    by_status: list[dict]
    by_source: list[dict]


class MovementBreakdownItem(BaseModel):
    reason: str
    movement_count: int
    net_units: int


class MovementBreakdownList(BaseModel):
    items: list[MovementBreakdownItem]


class StockValuation(BaseModel):
    cost_value_cents: int
    sell_value_cents: int
    total_units: int


class DashboardOverview(BaseModel):
    sales_summary: SalesSummary
    stock_valuation: StockValuation
    low_stock_count: int
    expiring_soon_count: int
    pending_prescriptions: int

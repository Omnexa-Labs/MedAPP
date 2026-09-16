from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .inventory_validation import Money


class DrugCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=255)
    brand_name: str | None = Field(None, max_length=255)
    sku: str | None = Field(None, max_length=64)
    category: str = Field(min_length=1, max_length=64)
    form: str = Field(min_length=1, max_length=64)
    strength: str = Field(min_length=1, max_length=64)
    unit: str = Field(min_length=1, max_length=32)
    reorder_level: int = Field(10, strict=True, ge=0, le=1_000_000)
    default_selling_price_cents: Money = 0
    currency: str | None = Field(None, pattern=r"^[A-Z]{3}$")
    requires_prescription: bool = False
    notes: str | None = Field(None, max_length=4000)

    @field_validator("brand_name", "sku", "notes")
    @classmethod
    def empty_optional(cls, value):
        return value or None


class DrugUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: int = Field(ge=1, strict=True)
    name: str | None = None
    brand_name: str | None = None
    sku: str | None = None
    category: str | None = None
    form: str | None = None
    strength: str | None = None
    unit: str | None = None
    reorder_level: int | None = Field(None, strict=True, ge=0, le=1_000_000)
    default_selling_price_cents: Money | None = None
    requires_prescription: bool | None = None
    is_active: bool | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def valid_changes(self):
        changes = self.model_dump(exclude_unset=True, exclude={"version", "is_active"})
        required = {
            "name",
            "category",
            "form",
            "strength",
            "unit",
            "reorder_level",
            "default_selling_price_cents",
            "requires_prescription",
        }
        if any(value is None and key in required for key, value in changes.items()):
            raise ValueError("Required drug fields cannot be cleared.")
        DrugCreate.model_validate(
            {
                "name": "unused",
                "category": "unused",
                "form": "unused",
                "strength": "unused",
                "unit": "unused",
                **changes,
            }
        )
        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("is_active cannot be null.")
        if len(self.model_fields_set) == 1:
            raise ValueError("Provide at least one changed field.")
        return self


class DrugOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version: int
    name: str
    brand_name: str | None
    sku: str | None
    category: str
    form: str
    strength: str
    unit: str
    reorder_level: int
    default_selling_price_cents: int
    currency: str
    requires_prescription: bool
    is_active: bool
    notes: str | None
    created_at: datetime


class DrugWithStock(DrugOut):
    quantity_on_hand: int
    is_low_stock: bool


class DrugList(BaseModel):
    items: list[DrugWithStock]
    total: int = 0
    limit: int = 200
    offset: int = 0
    currency: str = "GHS"


class StockAlertOut(BaseModel):
    drug_id: UUID
    drug_name: str
    quantity_on_hand: int
    reorder_level: int


class StockAlertList(BaseModel):
    items: list[StockAlertOut]


class ExpiringBatchOut(BaseModel):
    batch_id: UUID
    drug_id: UUID
    drug_name: str
    batch_number: str
    quantity_on_hand: int
    expiry_date: str


class ExpiringBatchList(BaseModel):
    items: list[ExpiringBatchOut]

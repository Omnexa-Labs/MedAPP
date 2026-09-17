from __future__ import annotations

from uuid import UUID
from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class MedAppPrescriptionItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    drug_name: str = Field(min_length=1, max_length=255)
    strength: str | None = Field(default=None, min_length=1, max_length=64)
    form: str | None = Field(default=None, min_length=1, max_length=64)
    drug_id_hint: UUID | None = None  # optional pre-resolved local drug id
    quantity_prescribed: int = Field(strict=True, gt=0, le=1_000_000)
    dosage_instructions: str | None = Field(default=None, max_length=512)


class MedAppPrescriptionWebhook(BaseModel):
    """Inbound payload from MedApp.

    `external_ref` is MedApp's own prescription id — we store it so a later
    dispense confirmation can be tied back without exposing PMS internals.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    external_ref: str = Field(min_length=1, max_length=128)
    prescriber_name: str | None = Field(default=None, max_length=255)
    prescriber_license: str | None = Field(default=None, max_length=64)
    customer_medapp_user_id: UUID | None = None
    customer_full_name: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=2000)
    valid_until: date | None = None
    items: list[MedAppPrescriptionItem] = Field(min_length=1, max_length=100)


class MedAppWebhookAck(BaseModel):
    prescription_id: UUID
    rx_number: str
    accepted_item_count: int
    unresolved_drugs: list[str] = []


class StockAvailabilityRow(BaseModel):
    drug_id: UUID
    drug_name: str
    quantity_on_hand: int
    selling_price_cents: int
    currency: str
    requires_prescription: bool


class StockAvailabilityResponse(BaseModel):
    pharmacy_id: UUID | None = None
    pharmacy_slug: str
    items: list[StockAvailabilityRow]

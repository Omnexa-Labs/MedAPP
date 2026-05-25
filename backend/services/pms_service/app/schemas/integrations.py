from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class MedAppPrescriptionItem(BaseModel):
    drug_name: str
    drug_id_hint: UUID | None = None  # optional pre-resolved local drug id
    quantity_prescribed: int
    dosage_instructions: str | None = None


class MedAppPrescriptionWebhook(BaseModel):
    """Inbound payload from MedApp.

    `external_ref` is MedApp's own prescription id — we store it so a later
    dispense confirmation can be tied back without exposing PMS internals.
    """

    external_ref: str
    prescriber_name: str | None = None
    prescriber_license: str | None = None
    customer_medapp_user_id: str | None = None
    customer_full_name: str | None = None
    customer_phone: str | None = None
    notes: str | None = None
    items: list[MedAppPrescriptionItem]


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
    pharmacy_slug: str
    items: list[StockAvailabilityRow]

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .inventory_validation import Money

PaymentMethod = Literal["cash", "card", "mobile_money", "insurance"]
Version = Annotated[int, Field(strict=True, ge=1, le=2_147_483_647)]


class TransactionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PaymentInput(TransactionInput):
    payment_method: PaymentMethod = "cash"
    payment_ref: str | None = Field(None, max_length=128)
    notes: str | None = Field(None, max_length=2000)
    # Quotes do not reserve stock. Recheck the reviewed amount under the write locks.
    expected_total_cents: Money | None = None


class CancelTransaction(TransactionInput):
    version: Version
    reason: str = Field(min_length=3, max_length=255)


class QuoteLine(BaseModel):
    drug_id: UUID
    drug_name: str
    batch_id: UUID
    batch_number: str
    quantity: int
    unit_price_cents: int
    line_total_cents: int


class TransactionQuote(BaseModel):
    subtotal_cents: int
    discount_cents: int
    tax_cents: int
    total_cents: int
    currency: str
    items: list[QuoteLine]

"""Versioned pharmacy dispensing snapshots; shared by sender and receiver."""

import hashlib
import hmac
import json
import re
import time
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

SYNC_PATH = "/v1/pharmacy-sync/events"
Count = Annotated[int, Field(strict=True, ge=0, le=1_000_000)]
Revision = Annotated[int, Field(strict=True, ge=1, le=2_147_483_647)]
EventKind = Literal["received", "dispensed", "corrected", "cancelled", "reconciled"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class DispensingItem(Contract):
    prescription_item_id: UUID
    drug_name: str = Field(min_length=1, max_length=255)
    dosage_instructions: str | None = Field(default=None, max_length=512)
    quantity_prescribed: Count = Field(gt=0)
    quantity_dispensed: Count
    quantity_returned: Count = 0

    @model_validator(mode="after")
    def balances(self):
        if not self.quantity_returned <= self.quantity_dispensed <= self.quantity_prescribed:
            raise ValueError("unsupported dispensing balance")
        return self


class DispensingSnapshot(Contract):
    rx_number: str = Field(min_length=1, max_length=32)
    rx_version: Revision
    status: Literal["pending", "partially_dispensed", "dispensed", "cancelled"]
    prescriber_name: str | None = Field(default=None, max_length=255)
    items: list[DispensingItem] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def coherent(self):
        if len({line.prescription_item_id for line in self.items}) != len(self.items):
            raise ValueError("duplicate prescription item")
        any_dispensed = any(line.quantity_dispensed for line in self.items)
        all_dispensed = all(
            line.quantity_dispensed == line.quantity_prescribed for line in self.items
        )
        if (
            (self.status == "pending" and any_dispensed)
            or (self.status == "dispensed" and not all_dispensed)
            or (self.status == "partially_dispensed" and (not any_dispensed or all_dispensed))
        ):
            raise ValueError("status does not match dispensing quantities")
        return self


class DispensingEvent(Contract):
    schema_version: Literal[1] = 1
    event_id: UUID
    deployment_key: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")
    pharmacy_id: UUID
    prescription_id: UUID
    external_ref: str = Field(min_length=1, max_length=128)
    patient_id: UUID
    sequence: Revision
    kind: EventKind
    occurred_at: AwareDatetime
    disposition: Literal["not_collected", "customer_return"] | None = None
    snapshot: DispensingSnapshot

    @model_validator(mode="after")
    def correction_disposition(self):
        if (self.kind == "corrected") != (self.disposition is not None):
            raise ValueError("only a correction requires a disposition")
        return self


class DeliveryAck(Contract):
    event_id: UUID
    pharmacy_id: UUID
    prescription_id: UUID
    sequence: Revision
    applied: bool = Field(strict=True)


def encode(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sign(raw: bytes, secret: str, timestamp: str) -> str:
    message = f"{timestamp}\nPOST\n{SYNC_PATH}\n".encode() + raw
    return "sha256=" + hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def authenticated(raw: bytes, secret: str, timestamp: str | None, signature: str | None) -> bool:
    if len(secret) < 32 or not timestamp or not re.fullmatch(r"[0-9]{1,12}", timestamp):
        return False
    if (
        abs(time.time() - int(timestamp)) > 300
        or not signature
        or not re.fullmatch(r"sha256=[0-9a-f]{64}", signature)
    ):
        return False
    return hmac.compare_digest(sign(raw, secret, timestamp), signature)

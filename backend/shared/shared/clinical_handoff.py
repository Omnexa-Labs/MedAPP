"""Authenticated clinical prescription handoff; IDs bind the patient and destination."""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class HandoffItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    drug_name: str = Field(min_length=1, max_length=255)
    strength: str = Field(min_length=1, max_length=64)
    form: str = Field(min_length=1, max_length=64)
    quantity_prescribed: int = Field(strict=True, ge=1, le=1_000_000)
    dosage_instructions: str = Field(min_length=1, max_length=512)


class HandoffPrescription(BaseModel):
    model_config = ConfigDict(extra="forbid")
    external_ref: UUID
    prescriber_name: str = Field(min_length=1, max_length=255)
    customer_medapp_user_id: UUID
    items: list[HandoffItem] = Field(min_length=1, max_length=20)


class ClinicalHandoff(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prescription_id: UUID
    pharmacy_id: UUID
    patient_id: UUID
    operation: Literal["send", "cancel"]
    prescription: HandoffPrescription | None = None
    valid_until: date | None = None

    @model_validator(mode="after")
    def consistent_identity(self):
        if self.operation == "send":
            if (
                self.prescription is None
                or self.valid_until is None
                or self.prescription.external_ref != self.prescription_id
                or self.prescription.customer_medapp_user_id != self.patient_id
            ):
                raise ValueError("prescription, patient and expiry must match the handoff")
        elif self.prescription is not None or self.valid_until is not None:
            raise ValueError("cancellation must not replace prescription contents")
        return self


class ClinicalHandoffAck(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prescription_id: UUID
    pharmacy_id: UUID
    operation: Literal["send", "cancel"]
    pms_prescription_id: UUID | None
    accepted_item_count: int = Field(strict=True, ge=0, le=20)

    def matches(self, command: ClinicalHandoff):
        return (
            self.prescription_id == command.prescription_id
            and self.pharmacy_id == command.pharmacy_id
            and self.operation == command.operation
            and (
                self.operation == "cancel"
                or (
                    self.pms_prescription_id is not None
                    and self.accepted_item_count == len(command.prescription.items)
                )
            )
        )

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PrescriptionItem(StrictModel):
    drug_name: str = Field(min_length=1, max_length=255)
    strength: str = Field(min_length=1, max_length=64)
    form: str = Field(min_length=1, max_length=64)
    dose: str = Field(min_length=1, max_length=80)
    route: str = Field(min_length=1, max_length=40)
    frequency: str = Field(min_length=1, max_length=80)
    duration: str = Field(min_length=1, max_length=80)
    quantity: int = Field(strict=True, ge=1, le=1_000_000)
    instructions: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def bounded_instructions(self):
        if len(self.dispensing_instructions()) > 512:
            raise ValueError("combined medicine directions must not exceed 512 characters")
        return self

    def dispensing_instructions(self):
        return f"{self.strength} {self.form}; {self.dose}; {self.route}; {self.frequency}; {self.duration}. {self.instructions}".strip()


class PrescriptionDraft(StrictModel):
    items: list[PrescriptionItem] = Field(min_length=1, max_length=20)
    clinical_goal: str = Field(default="", max_length=500)
    valid_until: date


class DraftUpdate(PrescriptionDraft):
    version: int = Field(strict=True, ge=1)


class Versioned(StrictModel):
    version: int = Field(strict=True, ge=1)


class IssuePrescription(Versioned):
    clinical_review_confirmed: Literal[True]


class ChangePrescription(Versioned):
    reason: str = Field(min_length=3, max_length=500)


class RoutePrescription(Versioned):
    pharmacy_id: UUID


class PrescriptionOut(BaseModel):
    id: UUID
    patient_user_id: UUID
    author_id: UUID
    prescriber_name: str
    version: int
    status: Literal["draft", "issued", "cancelled", "superseded"]
    items: list[PrescriptionItem]
    clinical_goal: str
    valid_until: date
    issued_at: datetime | None
    cancelled_at: datetime | None
    change_reason: str | None
    replaces_id: UUID | None
    replacement_id: UUID | None
    pharmacy_id: UUID | None
    deliveries: list[dict]
    created_at: datetime


class PrescriptionPage(BaseModel):
    items: list[PrescriptionOut]
    offset: int
    limit: int
    next_offset: int | None

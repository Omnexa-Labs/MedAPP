from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LabOrderCreate(BaseModel):
    patient_id: UUID
    test_name: str = Field(min_length=1, max_length=255)
    priority: str = Field(default="routine", max_length=32)
    instructions: str | None = Field(default=None, max_length=2000)
    due_at: datetime | None = None


class LabOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_id: UUID
    patient_id: UUID
    ordered_by_user_id: UUID
    test_name: str
    priority: str
    status: str
    instructions: str | None = None
    due_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class LabResultUpload(BaseModel):
    patient_id: UUID | None = None
    lab_order_id: UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    source: str = Field(default="patient_upload", max_length=64)
    summary: str | None = Field(default=None, max_length=4000)
    file_name: str | None = Field(default=None, max_length=255)
    mime_type: str | None = Field(default=None, max_length=128)
    storage_key: str | None = Field(default=None, max_length=255)
    external_url: str | None = Field(default=None, max_length=512)
    resulted_at: datetime | None = None
    raw_text: str | None = None
    parsed_values: dict[str, object] | None = None

    @model_validator(mode="after")
    def _require_patient_reference(self):
        if self.patient_id is None and self.lab_order_id is None:
            raise ValueError("patient_id or lab_order_id is required")
        return self


class LabResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    result_id: UUID
    patient_id: UUID
    lab_order_id: UUID | None = None
    uploaded_by_user_id: UUID
    source: str
    title: str
    status: str
    summary: str | None = None
    file_name: str | None = None
    mime_type: str | None = None
    storage_key: str | None = None
    external_url: str | None = None
    resulted_at: datetime | None = None
    raw_text: str | None = None
    parsed_values: dict[str, object] | None = None
    created_at: datetime
    updated_at: datetime


class LabResultList(BaseModel):
    items: list[LabResultOut] = Field(default_factory=list)


class LabSummaryOut(BaseModel):
    total_orders: int = 0
    open_orders: int = 0
    total_results: int = 0
    recent_results: list[LabResultOut] = Field(default_factory=list)


class LabSearchHitOut(BaseModel):
    score: float
    result: LabResultOut


class LabSearchResultsOut(BaseModel):
    query: str
    items: list[LabSearchHitOut] = Field(default_factory=list)
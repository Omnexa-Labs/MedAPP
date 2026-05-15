from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class KycDocument(BaseModel):
    kind: str = Field(description="license | id_card | certification | other")
    url: str
    notes: str | None = None


class KycSubmitRequest(BaseModel):
    target_role: str = Field(description="role being requested: doctor | nurse | hospital_admin")
    documents: list[KycDocument] = Field(min_length=1)


class KycSubmissionOut(BaseModel):
    id: UUID
    user_id: UUID
    status: str
    submitted_role: str
    documents: list[KycDocument]
    rejection_reason: str | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KycReviewRequest(BaseModel):
    approve: bool
    rejection_reason: str | None = Field(default=None, max_length=500)

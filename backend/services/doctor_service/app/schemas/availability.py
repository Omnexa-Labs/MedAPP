from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AvailabilityRuleBase(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    start_time: time
    end_time: time
    timezone: str = "UTC"


class AvailabilityRuleCreate(AvailabilityRuleBase):
    pass


class AvailabilityRuleOut(AvailabilityRuleBase):
    model_config = ConfigDict(from_attributes=True)

    rule_id: UUID
    doctor_id: UUID
    is_active: bool


class AvailabilityRulesPayload(BaseModel):
    items: list[AvailabilityRuleCreate] = Field(default_factory=list)


class SlotOut(BaseModel):
    doctor_id: UUID
    starts_at: datetime
    ends_at: datetime
    timezone: str


class SlotQuery(BaseModel):
    from_date: date
    to_date: date
    slot_minutes: int = Field(default=30, ge=5, le=240)
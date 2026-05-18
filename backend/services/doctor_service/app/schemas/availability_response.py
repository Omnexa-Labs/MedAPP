from pydantic import BaseModel, Field

from .availability import AvailabilityRuleOut, SlotOut


class AvailabilityRulesResponse(BaseModel):
    items: list[AvailabilityRuleOut] = Field(default_factory=list)


class SlotListResponse(BaseModel):
    items: list[SlotOut] = Field(default_factory=list)
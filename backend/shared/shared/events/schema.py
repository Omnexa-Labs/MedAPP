from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class DomainEvent(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    type: str
    source: str
    subject: str | None = None
    time: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    data: dict[str, Any] = Field(default_factory=dict)
    specversion: str = "1.0"

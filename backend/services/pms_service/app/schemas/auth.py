from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class StaffPublic(BaseModel):
    id: str
    full_name: str
    email: str
    role: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: StaffPublic


class PharmacyContext(BaseModel):
    id: UUID | None
    name: str
    deployment_key: str | None


class SessionContext(BaseModel):
    user: StaffPublic
    pharmacy: PharmacyContext
    expires_at: datetime

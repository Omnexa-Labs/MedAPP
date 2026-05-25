from __future__ import annotations

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

from datetime import date
from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: str
    dob: date | None = None
    gender: str | None = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: str | None = None
    dob: date | None = None
    gender: str | None = None
    allergies: list[str] | None = None

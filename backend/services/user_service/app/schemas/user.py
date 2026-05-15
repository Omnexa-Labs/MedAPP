from datetime import date
from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    phone: str | None = None
    first_name: str
    last_name: str
    role: str
    dob: date | None = None
    gender: str | None = None
    email_verified: bool
    phone_verified: bool
    kyc_status: str
    is_active: bool

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "examples": [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "email": "user@medapp.com",
                    "phone": "+233241234567",
                    "first_name": "Amina",
                    "last_name": "Mensah",
                    "role": "user",
                    "dob": "1995-04-12",
                    "gender": "female",
                    "email_verified": True,
                    "phone_verified": False,
                    "kyc_status": "not_required",
                    "is_active": True,
                }
            ]
        },
    }


class UserUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    dob: date | None = None
    gender: str | None = None
    allergies: list[str] | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "first_name": "Amina",
                    "last_name": "Mensah",
                    "gender": "female",
                    "allergies": ["peanuts"],
                }
            ]
        }
    }

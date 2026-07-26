from datetime import date
from typing import Annotated
from uuid import UUID

from pydantic import (
    AliasChoices,
    BaseModel,
    EmailStr,
    Field,
    StringConstraints,
)

from .medical import MedicalHistory


# Audit finding B-12: per-item bound on allergy strings. The ORM
# `@validates` hook is the ground-truth gate but rejecting at the schema
# layer gives clients a clean 422 instead of a 500 on bad input.
_AllergyEntry = Annotated[
    str, StringConstraints(min_length=1, max_length=120)
]


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    phone: str | None = None
    first_name: str = Field(
        validation_alias=AliasChoices("first_name", "firstname", "firstName")
    )
    last_name: str = Field(
        validation_alias=AliasChoices("last_name", "lastname", "surname", "lastName")
    )
    role: str
    dob: date | None = None
    gender: str | None = None
    email_verified: bool
    phone_verified: bool
    kyc_status: str
    is_active: bool
    allergies: list[str] = []
    medical_history: MedicalHistory = MedicalHistory()

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
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
                    "allergies": ["peanuts"],
                    "medical_history": {
                        "conditions": [],
                        "medications": [],
                        "surgeries": [],
                        "family_history": [],
                        "notes": None,
                    },
                }
            ]
        },
    }


class UserUpdate(BaseModel):
    # Audit finding C-9: this schema IS the field allowlist for PATCH /me.
    # Pydantic v2 defaults to silently dropping unknown fields; we set
    # `extra="forbid"` so an attempt to PATCH a privileged field (`role`,
    # `kyc_status`, `is_active`, `email_verified`, …) returns 422 with an
    # explicit error instead of being silently ignored. Anyone adding a
    # new sensitive field to the User model must consciously decide whether
    # to add it here.
    #
    # Audit finding B-12: `medical_history` is no longer a free-form dict.
    # It's `MedicalHistory` (Pydantic, ``extra="forbid"`` recursively) so
    # the platform never accepts PHI shapes it can't account for.
    first_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("first_name", "firstname", "firstName"),
    )
    last_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("last_name", "lastname", "surname", "lastName"),
    )
    dob: date | None = None
    gender: str | None = None
    allergies: list[_AllergyEntry] | None = Field(default=None, max_length=50)
    medical_history: MedicalHistory | None = None

    model_config = {
        "extra": "forbid",
        "populate_by_name": True,
        "json_schema_extra": {
            "examples": [
                {
                    "first_name": "Amina",
                    "last_name": "Mensah",
                    "gender": "female",
                    "allergies": ["peanuts"],
                    "medical_history": {
                        "conditions": [
                            {"name": "Asthma", "status": "active"}
                        ],
                        "medications": [
                            {"name": "Salbutamol", "dosage": "100mcg"}
                        ],
                    },
                }
            ]
        }
    }

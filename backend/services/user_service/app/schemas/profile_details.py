"""The personal details shared by signup and self-profile updates."""
from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, field_validator

BloodType = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
Gender = Literal["female", "male", "nonbinary", "other"]
HealthGoal = Literal["meds", "vitals", "tele", "wellness"]


class ProfileDetails(BaseModel):
    # Optional for older clients and for clearing a self-reported profile field.
    dob: date | None = None
    gender: Gender | None = None
    blood_type: BloodType | None = None
    primary_goal: HealthGoal | None = None

    @field_validator("dob")
    @classmethod
    def validate_birth_date(cls, value: date | None) -> date | None:
        if value is None:
            return None
        today = datetime.now(timezone.utc).date()
        age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
        if age < 13:
            raise ValueError("You must be at least 13 to sign up")
        return value

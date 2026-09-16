from datetime import date

from sqlalchemy import Boolean, Date, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, validates

from shared.db import Base, TimestampMixin


_MAX_ALLERGY_ITEMS = 50
_MAX_ALLERGY_LEN = 120


class User(Base, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(255))
    last_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), index=True, default="user")
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Self-reported signup/profile data, not a clinically verified blood group.
    blood_type: Mapped[str | None] = mapped_column(String(3), nullable=True)
    primary_goal: Mapped[str | None] = mapped_column(String(16), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    kyc_status: Mapped[str] = mapped_column(String(32), default="not_required", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    medical_history: Mapped[dict] = mapped_column(JSONB, default=dict)
    allergies: Mapped[list] = mapped_column(JSONB, default=list)
    consents: Mapped[dict] = mapped_column(JSONB, default=dict)

    __table_args__ = (Index("ix_users_role_active", "role", "is_active"),)

    # Audit finding B-12: defense in depth. The route-level schema in
    # `UserUpdate` is the primary gate, but a service-layer write (admin
    # tool, sync job, data import) would bypass it. SQLAlchemy
    # `@validates` runs on every attribute assignment — including those
    # — so the Pydantic schema is the only way medical_history is ever
    # stored.
    @validates("medical_history")
    def _validate_medical_history(self, _key, value):
        from ..schemas.medical import MedicalHistory

        if value is None:
            return {}
        if isinstance(value, MedicalHistory):
            return value.model_dump(mode="json")
        return MedicalHistory.model_validate(value).model_dump(mode="json")

    @validates("allergies")
    def _validate_allergies(self, _key, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("allergies must be a list of strings")
        if len(value) > _MAX_ALLERGY_ITEMS:
            raise ValueError(
                f"allergies: at most {_MAX_ALLERGY_ITEMS} entries allowed"
            )
        cleaned: list[str] = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError("allergies: each entry must be a string")
            stripped = item.strip()
            if not stripped:
                raise ValueError("allergies: entries cannot be empty")
            if len(stripped) > _MAX_ALLERGY_LEN:
                raise ValueError(
                    f"allergies: each entry must be <= {_MAX_ALLERGY_LEN} chars"
                )
            cleaned.append(stripped)
        return cleaned

from datetime import date

from sqlalchemy import Boolean, Date, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


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
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    kyc_status: Mapped[str] = mapped_column(String(32), default="not_required", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    medical_history: Mapped[dict] = mapped_column(JSONB, default=dict)
    allergies: Mapped[list] = mapped_column(JSONB, default=list)
    consents: Mapped[dict] = mapped_column(JSONB, default=dict)

    __table_args__ = (Index("ix_users_role_active", "role", "is_active"),)

from datetime import datetime
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class TwoFactor(Base, TimestampMixin):
    __tablename__ = "two_factors"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    recovery_hashes: Mapped[list] = mapped_column(JSON, default=list)
    generation: Mapped[str] = mapped_column(String(36))
    setup_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    setup_password_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_step: Mapped[int | None] = mapped_column(Integer, nullable=True)
    failures: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TwoFactorChallenge(Base, TimestampMixin):
    __tablename__ = "two_factor_challenges"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    generation: Mapped[str] = mapped_column(String(36))
    password_version: Mapped[str] = mapped_column(String(64))
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

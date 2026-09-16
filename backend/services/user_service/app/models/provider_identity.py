from datetime import datetime
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class ProviderIdentity(Base, TimestampMixin):
    __tablename__ = "provider_identities"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(16))
    subject: Mapped[str] = mapped_column(String(255))
    __table_args__ = (
        UniqueConstraint("provider", "subject", name="uq_provider_subject"),
        UniqueConstraint("user_id", "provider", name="uq_user_provider"),
    )


class ProviderAttempt(Base, TimestampMixin):
    __tablename__ = "provider_attempts"
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    provider: Mapped[str] = mapped_column(String(16))
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    nonce: Mapped[str] = mapped_column(String(64))
    stage: Mapped[str] = mapped_column(String(16), default="started")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    password_version: Mapped[str | None] = mapped_column(String(64), nullable=True)

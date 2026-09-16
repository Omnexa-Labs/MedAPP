from datetime import datetime
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column


class PartnerHandoff(Base, TimestampMixin):
    __tablename__ = "partner_handoffs"
    __table_args__ = (
        CheckConstraint(
            "(portal = 'pharmacy' AND pharmacy_id IS NOT NULL AND deployment_key IS NOT NULL) OR "
            "(portal != 'pharmacy' AND pharmacy_id IS NULL AND deployment_key IS NULL)",
            name="ck_handoff_pharmacy_target",
        ),
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    portal: Mapped[str] = mapped_column(String(16), default="partner", server_default="partner")
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source_session_id: Mapped[UUID] = mapped_column()
    password_version: Mapped[str] = mapped_column(String(64))
    application_id: Mapped[UUID | None] = mapped_column(nullable=True)
    pharmacy_id: Mapped[UUID | None] = mapped_column(nullable=True)
    deployment_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    return_uri: Mapped[str] = mapped_column(String(512))
    return_state: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

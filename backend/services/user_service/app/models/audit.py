from uuid import UUID

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class AuditLog(Base, TimestampMixin):
    """Append-only audit trail for security-sensitive events.

    No PHI. Action describes *what* happened (e.g. login_succeeded,
    password_reset_completed, kyc_approved); meta is a free-form JSONB blob
    for ip / user-agent / target / etc.
    """

    __tablename__ = "audit_log"

    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)

    __table_args__ = (Index("ix_audit_actor_action", "actor_id", "action"),)

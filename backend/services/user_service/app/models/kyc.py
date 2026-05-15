from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class KycSubmission(Base, TimestampMixin):
    """KYC submission for doctor / nurse / hospital_admin roles.

    Status flow: submitted -> under_review -> approved | rejected
    """

    __tablename__ = "kyc_submissions"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="submitted", index=True)
    submitted_role: Mapped[str] = mapped_column(String(32))
    documents: Mapped[list] = mapped_column(JSONB, default=list)
    reviewed_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

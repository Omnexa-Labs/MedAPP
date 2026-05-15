from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class OtpCode(Base, TimestampMixin):
    """6-digit OTP code, single-use, short TTL.

    The recipient is either a phone number (E.164) or an email address.
    """

    __tablename__ = "otp_codes"

    recipient: Mapped[str] = mapped_column(String(320), index=True)
    channel: Mapped[str] = mapped_column(String(16))  # "sms" | "email"
    purpose: Mapped[str] = mapped_column(String(32), index=True)  # "signup" | "login" | "verify"
    code_hash: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (Index("ix_otp_recipient_purpose", "recipient", "purpose"),)

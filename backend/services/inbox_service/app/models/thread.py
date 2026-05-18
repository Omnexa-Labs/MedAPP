from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db.base import Base, TimestampMixin


class ThreadStatus(StrEnum):
    OPEN = "open"
    PENDING = "pending"
    CLOSED = "closed"


class InboxThread(Base, TimestampMixin):
    __tablename__ = "threads"

    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="direct")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=ThreadStatus.OPEN.value, index=True)
    created_by_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    assigned_role: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    assigned_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    booking_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def thread_id(self) -> UUID:
        return self.id


class ThreadParticipant(Base, TimestampMixin):
    __tablename__ = "thread_participants"
    __table_args__ = (UniqueConstraint("thread_id", "user_id", name="uq_thread_participant"),)

    thread_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    @property
    def participant_id(self) -> UUID:
        return self.id


class ThreadMessage(Base, TimestampMixin):
    __tablename__ = "thread_messages"

    thread_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    sender_role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    @property
    def message_id(self) -> UUID:
        return self.id
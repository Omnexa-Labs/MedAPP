from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import JSON, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class HospitalDirectoryEvent(Base, TimestampMixin):
    __tablename__ = "hospital_directory_events"
    __table_args__ = (
        UniqueConstraint("hospital_id", "version", name="uq_hospital_directory_event_version"),
        Index("ix_hospital_directory_events_hospital_created", "hospital_id", "created_at"),
    )

    hospital_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id")
    )
    actor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    changed_fields: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    before: Mapped[dict] = mapped_column(JSON, nullable=False)
    after: Mapped[dict] = mapped_column(JSON, nullable=False)

from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import CheckConstraint, ForeignKey, LargeBinary
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class PharmacyPhoto(Base, TimestampMixin):
    """Small, normalized directory photos committed together with their draft."""

    __tablename__ = "pharmacy_photos"
    __table_args__ = (CheckConstraint("length(content) <= 1048576", name="ck_pharmacy_photo_size"),)

    pharmacy_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("pharmacy_profiles.id"), index=True
    )
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)

from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import JSON, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class ClinicalHandoffReceipt(Base, TimestampMixin):
    __tablename__ = "clinical_handoff_receipts"
    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    pharmacy_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    payload_hash: Mapped[str | None] = mapped_column(String(64))
    send_ack: Mapped[dict | None] = mapped_column(JSON)
    cancel_ack: Mapped[dict | None] = mapped_column(JSON)

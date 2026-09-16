import hashlib
import json
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class ActivationReceipt(Base, TimestampMixin):
    """One immutable receipt per application, in each receiving service's database."""

    __tablename__ = "professional_activation_receipts"
    applicant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    resource_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)


def command_hash(command):
    return hashlib.sha256(
        json.dumps(command.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


async def activation_lock(db, owner_id):
    # Serialize first-time profile creation for one owner; a missing profile has
    # no row to lock yet. Unique constraints remain the final duplicate barrier.
    if db.bind.dialect.name == "postgresql":
        key = int.from_bytes(
            hashlib.sha256(f"professional:{owner_id}".encode()).digest()[:8], "big", signed=True
        )
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})


async def previous_receipt(db, command):
    receipt = await db.get(ActivationReceipt, command.application_id)
    if receipt and receipt.request_hash != command_hash(command):
        raise HTTPException(409, "activation request conflicts with the recorded approval")
    return receipt


def record_receipt(db, command, resource_id):
    db.add(
        ActivationReceipt(
            id=command.application_id,
            applicant_id=command.applicant_id,
            request_hash=command_hash(command),
            role=command.role,
            resource_id=resource_id,
        )
    )

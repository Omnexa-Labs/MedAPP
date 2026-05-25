"""Idempotency-key storage for at-most-once write endpoints.

Audit finding B-17: the refund route was vulnerable to duplicate
processing on client retry (network hiccup → resend → second refund
row). This table records (user_id, scope, key) → response so the second
call returns the same response without re-running the action.

Scope is per-route (e.g. ``refund:{payment_id}``), so reusing the same
key on a different route is treated as a new request — matches what
clients expect from Stripe-style headers.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Integer, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class IdempotencyRecord(Base, TimestampMixin):
    __tablename__ = "idempotency_records"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "scope", "key", name="uq_idempotency_user_scope_key"
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    scope: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_status: Mapped[int] = mapped_column(Integer, nullable=False)
    response_body: Mapped[dict] = mapped_column(JSON, nullable=False)

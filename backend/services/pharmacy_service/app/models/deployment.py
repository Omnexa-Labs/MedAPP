from datetime import datetime
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class PharmacyDeployment(Base, TimestampMixin):
    __tablename__ = "pharmacy_deployments"
    pharmacy_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("pharmacy_profiles.id"), unique=True, nullable=False
    )
    deployment_key: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


class PharmacyDeploymentEvent(Base, TimestampMixin):
    __tablename__ = "pharmacy_deployment_events"
    pharmacy_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("pharmacy_profiles.id"), nullable=False, index=True
    )
    actor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    details: Mapped[dict] = mapped_column(JSON, nullable=False)

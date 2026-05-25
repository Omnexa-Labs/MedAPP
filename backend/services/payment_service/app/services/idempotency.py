"""Idempotency-Key helper for at-most-once write endpoints.

Audit finding B-17: real-money endpoints (refund first; future intents
in scope) must be safe against client retries. A client whose request
times out before it sees the response will retry — without this guard,
that retry creates a duplicate refund row and a duplicate provider
charge reversal.

Design:

* Storage is a single ``idempotency_records`` table (per-service, not
  shared) keyed on ``(user_id, scope, key)``. ``scope`` is the route
  identifier so a key reused on a different route is a fresh call.
* ``request_hash`` is sha256 of the canonical JSON of the request body.
  Same key + same body → cached response is returned with the recorded
  status code. Same key + different body → 409 (client misuse).
* Two parallel calls with the same key race on the unique constraint:
  the loser sees ``IntegrityError`` on flush, re-reads, and either
  returns the winner's response (same body) or 409 (different body).
* The record is written inside the caller's session — it commits
  atomically with the business write, so we never persist an
  idempotency record without the side-effect, or vice versa.

The helper is provider-agnostic and lives in the service package so any
write route in payment_service can adopt it.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.idempotency import IdempotencyRecord

log = logging.getLogger(__name__)


def _canonical_hash(payload: Any) -> str:
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), default=str
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def require_idempotency_key(key: str | None) -> str:
    """Raise 400 if the header is missing or empty; trim to 128 chars max.

    Kept separate from the storage helper so route handlers can fail fast
    on the missing-header case before they touch the DB.
    """
    if not key or not key.strip():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Idempotency-Key header required for this endpoint",
        )
    trimmed = key.strip()
    if len(trimmed) > 128:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Idempotency-Key must be 128 chars or fewer",
        )
    return trimmed


async def execute_idempotent(
    *,
    session: AsyncSession,
    user_id: UUID,
    scope: str,
    key: str,
    request_payload: Any,
    action: Callable[[], Awaitable[Any]],
    success_status: int = 200,
) -> tuple[Any, int]:
    """Run ``action`` exactly once per (user_id, scope, key).

    Returns ``(response_body, status_code)``. ``response_body`` is the
    JSON-serialisable dict produced by ``action`` or recovered from the
    cached record. ``request_payload`` is anything ``json.dumps`` accepts
    (with ``default=str``) — typically the Pydantic model dump.

    Raises 409 if the key has been used with a *different* request body.
    """
    request_hash = _canonical_hash(request_payload)
    stmt = select(IdempotencyRecord).where(
        IdempotencyRecord.user_id == user_id,
        IdempotencyRecord.scope == scope,
        IdempotencyRecord.key == key,
    )

    existing = await session.scalar(stmt)
    if existing is not None:
        if existing.request_hash != request_hash:
            log.warning(
                "idempotency.conflict user=%s scope=%s key=%s",
                user_id, scope, key,
            )
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Idempotency-Key already used with a different request body",
            )
        return existing.response_body, existing.response_status

    response_body = await action()
    if not isinstance(response_body, dict):
        raise TypeError(
            "execute_idempotent: action must return a JSON-serialisable dict"
        )

    record = IdempotencyRecord(
        user_id=user_id,
        scope=scope,
        key=key,
        request_hash=request_hash,
        response_status=success_status,
        response_body=response_body,
    )
    session.add(record)
    try:
        await session.flush()
    except IntegrityError:
        # Concurrent request beat us to the unique constraint. Roll back
        # OUR transaction (which includes the side-effect from `action`)
        # — the winner has already persisted theirs, so the operation
        # still happened exactly once. We then re-read and return the
        # winner's cached response.
        await session.rollback()
        winner = await session.scalar(stmt)
        if winner is None:  # pragma: no cover — should not happen
            raise
        if winner.request_hash != request_hash:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Idempotency-Key already used with a different request body",
            )
        return winner.response_body, winner.response_status

    return response_body, success_status

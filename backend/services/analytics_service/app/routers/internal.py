from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import DbSession
from ..schemas.analytics import EventIngest
from ..services import AnalyticsError, ingest_event

router = APIRouter(prefix="/v1/internal", tags=["Analytics"])


@router.post("/events", status_code=status.HTTP_202_ACCEPTED)
async def ingest(payload: EventIngest, db: AsyncSession = DbSession):
    try:
        await ingest_event(db, payload)
    except AnalyticsError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return {"status": "accepted"}
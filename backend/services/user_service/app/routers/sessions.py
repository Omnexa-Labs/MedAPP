from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import CurrentUser, DbSession
from ..models import RefreshToken, User
from ..services.auth_service import _as_utc, _now, decode_access_token, revoke_session

router = APIRouter()


class SessionOut(BaseModel):
    id: UUID
    started_at: datetime
    last_refreshed_at: datetime
    expires_at: datetime
    user_agent: str | None
    ip_address: str | None
    is_current: bool


class SessionPage(BaseModel):
    items: list[SessionOut]
    next_offset: int | None
    current_session_known: bool
    sign_out_delay_seconds: int


def _current_session(authorization: str) -> UUID | None:
    # CurrentUser has already verified this bearer. Legacy tokens have no sid;
    # never guess that an IP address or user-agent identifies the current session.
    sid = decode_access_token(authorization.split(" ", 1)[1]).get("sid")
    try:
        return UUID(sid) if sid else None
    except (ValueError, TypeError):
        return None


@router.get("", response_model=SessionPage)
async def list_sessions(
    user: User = CurrentUser, db: AsyncSession = DbSession,
    authorization: str = Header(), offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
) -> SessionPage:
    current = _current_session(authorization)
    rows = (await db.scalars(select(RefreshToken).where(
        RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None),
        RefreshToken.expires_at > _now(),
    ).order_by(func.coalesce(RefreshToken.session_started_at, RefreshToken.created_at).desc(),
               func.coalesce(RefreshToken.session_id, RefreshToken.id).desc())
      .offset(offset).limit(limit + 1))).all()
    items = [SessionOut(
        id=row.session_id or row.id,
        started_at=_as_utc(row.session_started_at or row.created_at),
        last_refreshed_at=_as_utc(row.created_at), expires_at=_as_utc(row.expires_at),
        user_agent=row.user_agent, ip_address=row.ip_address,
        is_current=(row.session_id or row.id) == current,
    ) for row in rows[:limit]]
    return SessionPage(items=items, next_offset=offset + limit if len(rows) > limit else None,
                       current_session_known=current is not None,
                       sign_out_delay_seconds=settings.jwt_access_ttl_minutes * 60)


class RevokeResult(BaseModel):
    current_session_revoked: bool


@router.delete("/{session_id}", response_model=RevokeResult)
async def remove_session(session_id: UUID, user: User = CurrentUser,
                         db: AsyncSession = DbSession, authorization: str = Header()) -> RevokeResult:
    if not await revoke_session(db, user.id, session_id):
        raise HTTPException(404, "session not found")
    return RevokeResult(current_session_revoked=_current_session(authorization) == session_id)

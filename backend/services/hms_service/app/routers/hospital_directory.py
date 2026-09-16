from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from shared.hospital_directory import (
    DirectoryAction,
    DirectoryEdit,
    DirectoryHistory,
    DirectoryView,
)
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import HmsPrincipal, get_hms_principal, get_mgmt_db
from ..services.hospital_directory import request_profile

router = APIRouter(prefix="/v1/hospital-profile", tags=["hospital profile"])
Database = Annotated[AsyncSession, Depends(get_mgmt_db)]
Administrator = Annotated[HmsPrincipal, Depends(get_hms_principal)]


@router.get("", response_model=DirectoryView)
async def read(db: Database, principal: Administrator, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await request_profile(db, principal, "GET")


@router.patch("", response_model=DirectoryView)
async def edit(payload: DirectoryEdit, db: Database, principal: Administrator, response: Response):
    result = await request_profile(db, principal, "PATCH", payload=payload)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post("/publish", response_model=DirectoryView)
async def publish(
    payload: DirectoryAction, db: Database, principal: Administrator, response: Response
):
    result = await request_profile(db, principal, "POST", "publish", payload)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post("/withdraw", response_model=DirectoryView)
async def withdraw(
    payload: DirectoryAction, db: Database, principal: Administrator, response: Response
):
    result = await request_profile(db, principal, "POST", "withdraw", payload)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get("/history", response_model=DirectoryHistory)
async def history(
    db: Database, principal: Administrator, response: Response, offset: int = Query(default=0, ge=0)
):
    response.headers["Cache-Control"] = "no-store"
    return await request_profile(db, principal, "GET", "history", offset=offset)

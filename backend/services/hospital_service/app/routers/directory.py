import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from shared.hospital_directory import (
    DirectoryHistory,
    DirectoryView,
    InternalDirectoryAction,
    InternalDirectoryEdit,
)
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import get_db
from ..services import directory


def authorize(x_hospital_directory_secret: str | None = Header(default=None)):
    expected = settings.hms_directory_secret.get_secret_value()
    if len(expected) < 32 or expected in {
        settings.jwt_secret,
        settings.onboarding_activation_secret.get_secret_value(),
    }:
        raise HTTPException(503, "Hospital profile management is not configured.")
    if not x_hospital_directory_secret or not secrets.compare_digest(
        expected, x_hospital_directory_secret
    ):
        raise HTTPException(401, "Invalid hospital profile service credential.")


router = APIRouter(
    prefix="/internal/hospital-profiles",
    tags=["internal hospital profiles"],
    dependencies=[Depends(authorize)],
)
Database = Annotated[AsyncSession, Depends(get_db)]


@router.get("/{hospital_id}", response_model=DirectoryView)
async def read(hospital_id: UUID, owner_user_id: UUID, db: Database, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return directory.view(await directory.hospital_record(db, hospital_id, owner_user_id))


@router.patch("/{hospital_id}", response_model=DirectoryView)
async def edit(hospital_id: UUID, payload: InternalDirectoryEdit, db: Database, response: Response):
    result = await directory.save_draft(db, hospital_id, payload)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post("/{hospital_id}/publish", response_model=DirectoryView)
async def publish(
    hospital_id: UUID, payload: InternalDirectoryAction, db: Database, response: Response
):
    result = await directory.publish(db, hospital_id, payload)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post("/{hospital_id}/withdraw", response_model=DirectoryView)
async def withdraw(
    hospital_id: UUID, payload: InternalDirectoryAction, db: Database, response: Response
):
    result = await directory.withdraw(db, hospital_id, payload)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get("/{hospital_id}/history", response_model=DirectoryHistory)
async def history(
    hospital_id: UUID,
    owner_user_id: UUID,
    db: Database,
    response: Response,
    offset: int = Query(default=0, ge=0),
):
    response.headers["Cache-Control"] = "no-store"
    return await directory.history(db, hospital_id, owner_user_id, offset)

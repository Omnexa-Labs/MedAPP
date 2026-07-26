"""Pharmacist directory routes.

Patient-facing read directory. GETs are public; mutations require
auth + `pharmacist` (or `admin`) role.

Pagination is offset-based with a 200-row cap, same contract as
pharmacy_service. List response carries (items, total, limit, offset).

Optional `?pharmacy_id=` narrows to a single affiliated pharmacy —
useful when the patient is browsing a pharmacy's detail screen and
wants to see "who works here". The UUID isn't validated against
pharmacy_service (separate DB) — orphan refs are accepted and the
filter just returns nothing if the ID is bogus.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal, get_current_principal

from ..deps import DbSession
from ..schemas.pharmacist import (
    PharmacistCreate,
    PharmacistList,
    PharmacistOut,
    PharmacistUpdate,
)
from ..services import (
    PharmacistError,
    create_pharmacist_profile,
    delete_pharmacist_profile,
    get_pharmacist_profile,
    list_pharmacist_profiles,
    update_pharmacist_profile,
)

router = APIRouter(prefix="/v1/pharmacists", tags=["Pharmacist"])


@router.post("", response_model=PharmacistOut, status_code=status.HTTP_201_CREATED)
async def create(
    payload: PharmacistCreate,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> PharmacistOut:
    try:
        profile = await create_pharmacist_profile(db, principal, payload)
    except PharmacistError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return PharmacistOut.model_validate(profile)


@router.get("", response_model=PharmacistList)
async def index(
    q: str | None = None,
    pharmacy_id: UUID | None = None,
    only_listable: bool = True,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = DbSession,
) -> PharmacistList:
    items, total = await list_pharmacist_profiles(
        db,
        q=q,
        pharmacy_id=pharmacy_id,
        only_listable=only_listable,
        limit=limit,
        offset=offset,
    )
    return PharmacistList(
        items=[PharmacistOut.model_validate(p) for p in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{pharmacist_id}", response_model=PharmacistOut)
async def read(pharmacist_id: UUID, db: AsyncSession = DbSession) -> PharmacistOut:
    try:
        profile = await get_pharmacist_profile(db, pharmacist_id)
    except PharmacistError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return PharmacistOut.model_validate(profile)


@router.patch("/{pharmacist_id}", response_model=PharmacistOut)
async def update(
    pharmacist_id: UUID,
    payload: PharmacistUpdate,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> PharmacistOut:
    try:
        profile = await update_pharmacist_profile(db, principal, pharmacist_id, payload)
    except PharmacistError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return PharmacistOut.model_validate(profile)


@router.delete("/{pharmacist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    pharmacist_id: UUID,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> None:
    try:
        await delete_pharmacist_profile(db, principal, pharmacist_id)
    except PharmacistError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

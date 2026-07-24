"""Pharmacy directory routes.

Patient-facing directory. GETs (list + detail + stock) are intentionally
public — the directory is the front door of Find Care. Mutations
(POST/PATCH/DELETE) require auth + a `pharmacy` (or `admin`) role.

Pagination is offset-based with a 200-row cap. The list response
envelope carries `total` so a client can render "showing N of M"
without a second round-trip — matches hms_service patients.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal, get_current_principal

from ..deps import DbSession
from ..schemas.pharmacy import (
    PharmacyCreate,
    PharmacyList,
    PharmacyOut,
    PharmacyStockBadgeOut,
    PharmacyUpdate,
)
from ..services import (
    PharmacyError,
    StockLookupError,
    check_drug_at_pharmacy,
    create_pharmacy_profile,
    delete_pharmacy_profile,
    get_pharmacy_profile,
    list_pharmacy_profiles,
    update_pharmacy_profile,
)

router = APIRouter(prefix="/v1/pharmacies", tags=["Pharmacy"])


@router.post("", response_model=PharmacyOut, status_code=status.HTTP_201_CREATED)
async def create(
    payload: PharmacyCreate,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> PharmacyOut:
    try:
        profile = await create_pharmacy_profile(db, principal, payload)
    except PharmacyError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return PharmacyOut.model_validate(profile)


@router.get("", response_model=PharmacyList)
async def index(
    q: str | None = None,
    city: str | None = None,
    insurance: str | None = None,
    only_listable: bool = True,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = DbSession,
) -> PharmacyList:
    items, total = await list_pharmacy_profiles(
        db,
        q=q,
        city=city,
        insurance=insurance,
        only_listable=only_listable,
        limit=limit,
        offset=offset,
    )
    return PharmacyList(
        items=[PharmacyOut.model_validate(p) for p in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{pharmacy_id}", response_model=PharmacyOut)
async def read(pharmacy_id: UUID, db: AsyncSession = DbSession) -> PharmacyOut:
    try:
        profile = await get_pharmacy_profile(db, pharmacy_id)
    except PharmacyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return PharmacyOut.model_validate(profile)


@router.patch("/{pharmacy_id}", response_model=PharmacyOut)
async def update(
    pharmacy_id: UUID,
    payload: PharmacyUpdate,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> PharmacyOut:
    try:
        profile = await update_pharmacy_profile(db, principal, pharmacy_id, payload)
    except PharmacyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return PharmacyOut.model_validate(profile)


@router.delete("/{pharmacy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    pharmacy_id: UUID,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> None:
    try:
        await delete_pharmacy_profile(db, principal, pharmacy_id)
    except PharmacyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.get("/{pharmacy_id}/stock", response_model=PharmacyStockBadgeOut)
async def stock(
    pharmacy_id: UUID,
    drug_name: str = Query(min_length=1),
    db: AsyncSession = DbSession,
) -> PharmacyStockBadgeOut:
    """On-demand stock lookup for a pharmacy.

    Public (no auth) — the directory is public, so a "do you have X"
    answer is too. The upstream pms_service guards itself via partner
    token (the signature we mint per request); this route never echoes
    the secret back to the caller.
    """
    try:
        profile = await get_pharmacy_profile(db, pharmacy_id)
    except PharmacyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    try:
        return await check_drug_at_pharmacy(profile, drug_name)
    except StockLookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

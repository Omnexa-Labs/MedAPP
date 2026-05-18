from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..deps import DbSession, get_current_principal
from ..schemas.lab import LabOrderCreate, LabOrderOut, LabResultList, LabResultOut, LabResultUpload
from ..services import LabError, create_lab_order, get_lab_result, list_my_results, upload_lab_result

router = APIRouter(prefix="/v1/lab", tags=["Lab"])
me_router = APIRouter(prefix="/v1/me/lab", tags=["Lab"])


@router.post("/orders", response_model=LabOrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(payload: LabOrderCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        order = await create_lab_order(db, principal, payload)
    except LabError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return LabOrderOut.model_validate(order)


@router.post("/results/upload", response_model=LabResultOut, status_code=status.HTTP_201_CREATED)
async def upload_result(payload: LabResultUpload, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        result = await upload_lab_result(db, principal, payload)
    except LabError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return LabResultOut.model_validate(result)


@router.get("/results/{result_id}", response_model=LabResultOut)
async def read_result(result_id: UUID, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        result = await get_lab_result(db, principal, result_id)
    except LabError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return LabResultOut.model_validate(result)


@me_router.get("/results", response_model=LabResultList)
async def read_my_results(db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    results = await list_my_results(db, principal)
    return LabResultList(items=[LabResultOut.model_validate(result) for result in results])
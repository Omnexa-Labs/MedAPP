from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from .. import events
from ..deps import DbSession, get_current_principal
from ..schemas.lab import LabOrderCreate, LabOrderOut, LabResultList, LabResultOut, LabResultUpload, LabSearchResultsOut, LabSummaryOut
from ..services import LabError, create_lab_order, get_lab_result, get_lab_summary, index_lab_result, list_my_results, search_my_results, upload_lab_result

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
async def upload_result(
    payload: LabResultUpload,
    request: Request,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    try:
        result = await upload_lab_result(db, principal, payload)
    except LabError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    index_lab_result(request.app.state.qdrant, result)
    # Publish AFTER both the DB write and the Qdrant index are durable —
    # consumers can immediately query either source on receipt of the event.
    # Best-effort; broker hiccups never turn a 201 into a 5xx.
    await events.publish(
        request.app,
        event_type="lab.result.created",
        subject=str(result.patient_id),
        data={
            "patient_id": str(result.patient_id),
            "result_id": str(result.result_id),
            "lab_order_id": str(result.lab_order_id) if result.lab_order_id else None,
            "title": result.title,
            "source": result.source,
            "status": result.status,
            "resulted_at": result.resulted_at.isoformat() if result.resulted_at else None,
        },
    )
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


@me_router.get("/summary", response_model=LabSummaryOut)
async def read_my_summary(db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    return await get_lab_summary(db, principal)


@me_router.get("/search", response_model=LabSearchResultsOut)
async def search_my_lab_results(
    q: str,
    request: Request,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    return await search_my_results(db, principal, q, request.app.state.qdrant)
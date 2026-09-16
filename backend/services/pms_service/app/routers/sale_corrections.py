from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import func, select

from ..deps import DbSession, require_roles
from ..models.core import AuditLog, SaleCorrection, SaleRefund, Staff
from ..schemas.sale_corrections import (
    CorrectionCreate,
    CorrectionList,
    CorrectionOut,
    CorrectionQuote,
    ReconcilePrescription,
    RefundCreate,
    RefundList,
    RefundOut,
    RefundVoid,
)
from ..schemas.sales import SaleOut
from ..services import inventory_requests as requests
from ..services import sale_corrections as service
from .sales import ALL, VOID, serialize

router = APIRouter(prefix="/v1/sales", tags=["sale corrections"])


@router.get("/{sale_id}/corrections", response_model=CorrectionList)
async def corrections(
    sale_id: UUID,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db=DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(SaleCorrection).where(SaleCorrection.sale_id == sale_id)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = list(
        await db.scalars(
            stmt.order_by(SaleCorrection.created_at.desc(), SaleCorrection.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    return CorrectionList(
        items=await service.correction_outputs(rows, db), total=total, limit=limit, offset=offset
    )


@router.get("/{sale_id}/refunds", response_model=RefundList)
async def refunds(
    sale_id: UUID,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db=DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(SaleRefund).where(SaleRefund.sale_id == sale_id)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = list(
        await db.scalars(
            stmt.order_by(SaleRefund.created_at.desc(), SaleRefund.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    names = (
        dict(
            (
                await db.execute(
                    select(Staff.id, Staff.full_name).where(
                        Staff.id.in_({row.actor_staff_id for row in rows})
                    )
                )
            ).all()
        )
        if rows
        else {}
    )
    return RefundList(
        items=[
            RefundOut.model_validate(row).model_copy(
                update={"actor_name": names.get(row.actor_staff_id)}
            )
            for row in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/{sale_id}/corrections/quote", response_model=CorrectionQuote)
async def quote(
    sale_id: UUID, body: CorrectionCreate, db=DbSession, _=Depends(require_roles(*VOID))
):
    return (await service.prepare(sale_id, body, db))[-1]


async def mutate(sale_id, body, key, actor, db, action, refund_id=None):
    operation = "sale." + action + ":" + str(refund_id or sale_id)
    previous = await requests.begin_request(
        db, key, actor, operation, {"sale_id": str(sale_id), **body.model_dump(mode="json")}
    )
    if previous is not None:
        return previous
    if action == "corrected":
        row = await service.correct(sale_id, body, actor, db)
        result = (await service.correction_outputs([row], db))[0]
    elif action == "refunded":
        row = await service.record_refund(sale_id, body, actor, db)
        result = RefundOut.model_validate(row)
    elif action == "refund_record_voided":
        row = await service.void_refund(sale_id, refund_id, body, actor, db)
        result = RefundOut.model_validate(row)
    else:
        row = await service.reconcile(sale_id, body, db)
        result = (await serialize([row], db))[0]
    db.add(
        AuditLog(
            actor_staff_id=actor,
            action="sale." + action,
            entity_type="sale",
            entity_id=sale_id,
            payload_json={
                "request": body.model_dump(mode="json"),
                "result": result.model_dump(mode="json"),
            },
        )
    )
    return await requests.finish_request(db, key, result)


@router.post("/{sale_id}/corrections", response_model=CorrectionOut, status_code=201)
async def correct(
    sale_id: UUID,
    body: CorrectionCreate,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*VOID)),
):
    return await mutate(sale_id, body, idempotency_key, UUID(principal.subject), db, "corrected")


@router.post("/{sale_id}/refunds", response_model=RefundOut, status_code=201)
async def refund(
    sale_id: UUID,
    body: RefundCreate,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*VOID)),
):
    return await mutate(sale_id, body, idempotency_key, UUID(principal.subject), db, "refunded")


@router.post("/{sale_id}/refunds/{refund_id}/void", response_model=RefundOut)
async def void_refund(
    sale_id: UUID,
    refund_id: UUID,
    body: RefundVoid,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles("pharmacy_admin")),
):
    return await mutate(
        sale_id,
        body,
        idempotency_key,
        UUID(principal.subject),
        db,
        "refund_record_voided",
        refund_id,
    )


@router.post("/{sale_id}/reconcile-prescription", response_model=SaleOut)
async def reconcile(
    sale_id: UUID,
    body: ReconcilePrescription,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles("pharmacy_admin")),
):
    return await mutate(
        sale_id, body, idempotency_key, UUID(principal.subject), db, "prescription_reconciled"
    )

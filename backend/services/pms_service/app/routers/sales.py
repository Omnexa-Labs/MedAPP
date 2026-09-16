from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func, select

from ..deps import DbSession, require_roles
from ..models.core import AuditLog, Sale, SaleItem
from ..schemas.sales import SaleItemOut, SaleList, SaleOut, WalkInSaleCreate
from ..schemas.transactions import CancelTransaction, PaymentMethod, TransactionQuote
from ..services import inventory_requests as requests
from ..services import pos_service

router = APIRouter(prefix="/v1/sales", tags=["sales"])
ALL = ("pharmacy_admin", "pharmacist", "cashier")
VOID = ("pharmacy_admin", "pharmacist")


async def serialize(rows, db):
    grouped = {sale.id: [] for sale in rows}
    from ..services import sale_corrections

    credits, refunds = await sale_corrections.totals(db, list(grouped))
    if grouped:
        items = list(
            await db.scalars(
                select(SaleItem)
                .where(SaleItem.sale_id.in_(grouped))
                .order_by(SaleItem.created_at, SaleItem.id)
            )
        )
        corrected = await sale_corrections.corrected_quantities(db, [item.id for item in items])
        for item in items:
            out = SaleItemOut.model_validate(item)
            out.corrected_quantity = corrected.get(item.id, 0)
            grouped[item.sale_id].append(out)
    return [
        SaleOut(
            **{
                key: getattr(sale, key)
                for key in SaleOut.model_fields
                if key not in {"items", "credited_cents", "refunded_cents", "refundable_cents"}
            },
            items=grouped[sale.id],
            credited_cents=sale.total_cents if sale.status == "voided" else credits.get(sale.id, 0),
            refunded_cents=refunds.get(sale.id, 0),
            refundable_cents=max(
                0,
                (sale.total_cents if sale.status == "voided" else credits.get(sale.id, 0))
                - refunds.get(sale.id, 0),
            ),
        )
        for sale in rows
    ]


@router.get("", response_model=SaleList)
async def list_sales(
    sale_status: str | None = Query(None, alias="status", pattern="^(completed|voided)$"),
    payment_method: PaymentMethod | None = None,
    prescription_id: UUID | None = None,
    search: str | None = Query(None, max_length=128),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db=DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(Sale)
    if sale_status:
        stmt = stmt.where(Sale.status == sale_status)
    if payment_method:
        stmt = stmt.where(Sale.payment_method == payment_method)
    if prescription_id:
        stmt = stmt.where(Sale.prescription_id == prescription_id)
    if search and search.strip():
        stmt = stmt.where(
            func.lower(Sale.sale_number).contains(search.strip().lower(), autoescape=True)
        )
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = list(
        await db.scalars(
            stmt.order_by(Sale.created_at.desc(), Sale.id.desc()).offset(offset).limit(limit)
        )
    )
    return SaleList(items=await serialize(rows, db), total=total, limit=limit, offset=offset)


@router.post("/quote", response_model=TransactionQuote)
async def quote_sale(body: WalkInSaleCreate, db=DbSession, _=Depends(require_roles(*ALL))):
    return (await pos_service.prepare(body, db))[1]


@router.post("", response_model=SaleOut, status_code=201)
async def create_walk_in_sale(
    body: WalkInSaleCreate,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*ALL)),
):
    actor = UUID(principal.subject)
    previous = await requests.begin_request(
        db, idempotency_key, actor, "sale.create", body.model_dump(mode="json")
    )
    if previous is not None:
        return previous
    sale = await pos_service.record_walk_in_sale(body, actor, db)
    result = (await serialize([sale], db))[0]
    db.add(
        AuditLog(
            actor_staff_id=actor,
            action="sale.created",
            entity_type="sale",
            entity_id=sale.id,
            payload_json=result.model_dump(mode="json"),
        )
    )
    return await requests.finish_request(db, idempotency_key, result)


@router.get("/{sale_id}", response_model=SaleOut)
async def get_sale(sale_id: UUID, db=DbSession, _=Depends(require_roles(*ALL))):
    sale = await db.get(Sale, sale_id)
    if sale is None:
        raise HTTPException(404, "Sale not found.")
    return (await serialize([sale], db))[0]


@router.post("/{sale_id}/void", response_model=SaleOut)
async def void_sale(
    sale_id: UUID,
    body: CancelTransaction,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*VOID)),
):
    actor = UUID(principal.subject)
    previous = await requests.begin_request(
        db, idempotency_key, actor, "sale.void:" + str(sale_id), body.model_dump(mode="json")
    )
    if previous is not None:
        return previous
    sale = await pos_service.void_sale(sale_id, body, actor, db)
    result = (await serialize([sale], db))[0]
    db.add(
        AuditLog(
            actor_staff_id=actor,
            action="sale.voided",
            entity_type="sale",
            entity_id=sale.id,
            payload_json=result.model_dump(mode="json"),
        )
    )
    return await requests.finish_request(db, idempotency_key, result)

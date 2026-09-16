from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func, or_, select

from ..deps import DbSession, require_roles
from ..models.core import AuditLog, PurchaseOrder, Staff, Supplier
from ..schemas.purchase_orders import (
    CancelOrder,
    OrderHistory,
    OrderStatus,
    OrderVersion,
    PurchaseOrderCreate,
    PurchaseOrderList,
    PurchaseOrderOut,
    PurchaseOrderUpdate,
    ReceiveGoodsRequest,
    ReconcileReceipts,
)
from ..services import inventory_requests as requests
from ..services import inventory_service as inventory
from ..services import purchase_order_service as service

router = APIRouter(prefix="/v1/purchase-orders", tags=["purchase-orders"])
ALL = ("pharmacy_admin", "pharmacist", "cashier")
EDIT = ("pharmacy_admin", "pharmacist")


@router.get("", response_model=PurchaseOrderList)
async def list_pos(
    po_status: OrderStatus | None = Query(None, alias="status"),
    search: str | None = Query(None, max_length=128),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db=DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(PurchaseOrder).outerjoin(Supplier, Supplier.id == PurchaseOrder.supplier_id)
    if po_status:
        stmt = stmt.where(PurchaseOrder.status == po_status)
    if search and search.strip():
        term = search.strip().lower()
        stmt = stmt.where(
            or_(
                func.lower(PurchaseOrder.po_number).contains(term, autoescape=True),
                func.lower(
                    func.coalesce(PurchaseOrder.supplier_name_snapshot, Supplier.name)
                ).contains(term, autoescape=True),
            )
        )
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    orders = list(
        await db.scalars(
            stmt.order_by(PurchaseOrder.created_at.desc(), PurchaseOrder.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    return PurchaseOrderList(
        items=await service.serialize_orders(db, orders),
        total=total,
        limit=limit,
        offset=offset,
        currency=await inventory.pharmacy_currency(db),
    )


@router.get("/{po_id}", response_model=PurchaseOrderOut)
async def get_po(po_id: UUID, db=DbSession, _=Depends(require_roles(*ALL))):
    return (await service.serialize_orders(db, [await service.get_po(po_id, db)]))[0]


@router.post("", response_model=PurchaseOrderOut, status_code=201)
async def create_po(
    body: PurchaseOrderCreate,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*EDIT)),
):
    actor = UUID(principal.subject)
    previous = await requests.begin_request(
        db, idempotency_key, actor, "purchase_order.create", body.model_dump(mode="json")
    )
    if previous is not None:
        return previous
    po = await service.create_po(body, actor, db)
    result = (await service.serialize_orders(db, [po]))[0]
    db.add(
        AuditLog(
            actor_staff_id=actor,
            action="purchase_order.created",
            entity_type="purchase_order",
            entity_id=po.id,
            payload_json={"version": po.version, "after": result.model_dump(mode="json")},
        )
    )
    return await requests.finish_request(db, idempotency_key, result)


async def mutate(po_id, body, key, db, principal, action):
    actor = UUID(principal.subject)
    previous = await requests.begin_request(
        db, key, actor, "purchase_order." + action + ":" + str(po_id), body.model_dump(mode="json")
    )
    if previous is not None:
        return previous
    po = await service.get_po(po_id, db, lock=True)
    if body.version != po.version:
        raise HTTPException(409, "This order changed. Reload before making another change.")
    before = (await service.serialize_orders(db, [po]))[0].model_dump(mode="json")
    details = {}
    if action == "updated":
        await service.set_draft(po, body, db)
    elif action == "ordered":
        await service.mark_ordered(po, db)
    elif action == "cancelled":
        service.cancel(po, body)
        details["note"] = body.reason
    elif action == "received":
        details["batch_ids"] = await service.receive_goods(po, body, actor, db)
        details.update(
            delivery_reference=body.delivery_reference, received_at=body.received_at.isoformat()
        )
    elif action == "reconciled":
        await service.reconcile(po, body, db)
        details["note"] = body.note
        details["allocations"] = body.model_dump(mode="json")["allocations"]
    po.version += 1
    await db.flush()
    result = (await service.serialize_orders(db, [po]))[0]
    db.add(
        AuditLog(
            actor_staff_id=actor,
            action="purchase_order." + action,
            entity_type="purchase_order",
            entity_id=po.id,
            payload_json={
                "version": po.version,
                "before": before,
                "after": result.model_dump(mode="json"),
                **details,
            },
        )
    )
    return await requests.finish_request(db, key, result)


@router.patch("/{po_id}", response_model=PurchaseOrderOut)
async def update_po(
    po_id: UUID,
    body: PurchaseOrderUpdate,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*EDIT)),
):
    return await mutate(po_id, body, idempotency_key, db, principal, "updated")


@router.post("/{po_id}/send", response_model=PurchaseOrderOut)
async def send_po(
    po_id: UUID,
    body: OrderVersion,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*EDIT)),
):
    return await mutate(po_id, body, idempotency_key, db, principal, "ordered")


@router.post("/{po_id}/cancel", response_model=PurchaseOrderOut)
async def cancel_po(
    po_id: UUID,
    body: CancelOrder,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*EDIT)),
):
    return await mutate(po_id, body, idempotency_key, db, principal, "cancelled")


@router.post("/{po_id}/receive", response_model=PurchaseOrderOut)
async def receive_goods(
    po_id: UUID,
    body: ReceiveGoodsRequest,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*EDIT)),
):
    return await mutate(po_id, body, idempotency_key, db, principal, "received")


@router.post("/{po_id}/reconcile", response_model=PurchaseOrderOut)
async def reconcile(
    po_id: UUID,
    body: ReconcileReceipts,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles("pharmacy_admin")),
):
    return await mutate(po_id, body, idempotency_key, db, principal, "reconciled")


@router.get("/{po_id}/history", response_model=OrderHistory)
async def history(
    po_id: UUID, offset: int = Query(0, ge=0), db=DbSession, _=Depends(require_roles(*EDIT))
):
    await service.get_po(po_id, db)
    rows = (
        await db.execute(
            select(AuditLog, Staff.full_name)
            .outerjoin(Staff, Staff.id == AuditLog.actor_staff_id)
            .where(AuditLog.entity_id == po_id, AuditLog.entity_type == "purchase_order")
            .order_by(
                AuditLog.payload_json["version"].as_integer().desc(),
                AuditLog.created_at.desc(),
                AuditLog.id.desc(),
            )
            .offset(offset)
            .limit(51)
        )
    ).all()
    return OrderHistory(
        items=[
            dict(
                id=entry.id,
                action=entry.action,
                actor_name=name,
                created_at=entry.created_at,
                details=entry.payload_json,
            )
            for entry, name in rows[:50]
        ],
        has_more=len(rows) > 50,
    )

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..models.core import InventoryRequest


async def begin_request(db, request_id: UUID, actor_id: UUID, operation: str, payload: dict):
    insert = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
    inserted = await db.scalar(
        insert(InventoryRequest)
        .values(
            id=request_id,
            actor_staff_id=actor_id,
            operation=operation,
            request=payload,
        )
        .on_conflict_do_nothing(index_elements=[InventoryRequest.id])
        .returning(InventoryRequest.id)
    )
    if inserted is not None:
        return None
    record = await db.scalar(select(InventoryRequest).where(InventoryRequest.id == request_id))
    if (
        not record
        or record.actor_staff_id != actor_id
        or record.operation != operation
        or record.request != payload
    ):
        raise HTTPException(
            409,
            "This request reference belongs to a different operation. Reload before making a new change.",
        )
    if record.result is None:
        raise HTTPException(409, "This operation is still being recorded. Retry the same request.")
    return record.result


async def finish_request(db, request_id, result, *, commit=True):
    payload = result.model_dump(mode="json")
    await db.execute(
        update(InventoryRequest).where(InventoryRequest.id == request_id).values(result=payload)
    )
    if commit:
        await db.commit()
    return result

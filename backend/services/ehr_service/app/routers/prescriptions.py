from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy import or_, select

from ..deps import CurrentPrincipalDep, DbSession
from ..models import ClinicalPrescription as Rx
from ..schemas.prescription import (
    ChangePrescription,
    DraftUpdate,
    IssuePrescription,
    PrescriptionDraft,
    PrescriptionOut,
    PrescriptionPage,
    RoutePrescription,
    Versioned,
)
from ..services import prescriptions as service
from ..services.prescriber import get_prescriber_lookup
from ..services.record_service import _principal_uuid, record_access

Prescriber = Depends(get_prescriber_lookup)
RequestKey = Header()


def private_response(response: Response):
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(
    prefix="/v1/patients/{patient_id}/prescriptions",
    tags=["clinical prescriptions"],
    dependencies=[Depends(private_response)],
)


@router.get("", response_model=PrescriptionPage)
async def index(
    patient_id: UUID,
    limit: int = Query(25, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db=DbSession,
    principal=CurrentPrincipalDep,
    lookup=Prescriber,
):
    if principal.subject != str(patient_id):
        await lookup(principal)
    patient = await service.authorize(db, principal, patient_id)
    actor = _principal_uuid(principal)
    rows = list(
        await db.scalars(
            select(Rx)
            .where(
                Rx.patient_id == patient.id,
            or_(Rx.issued_at.is_not(None), Rx.author_id == actor)
                if actor != patient_id
                else Rx.issued_at.is_not(None),
            )
            .order_by(Rx.created_at.desc(), Rx.id.desc())
            .offset(offset)
            .limit(limit + 1)
        )
    )
    await record_access(db, actor, patient.id, "prescription_list", "clinical prescription history")
    return PrescriptionPage(
        items=[await service.output(db, patient, rx) for rx in rows[:limit]],
        limit=limit,
        offset=offset,
        next_offset=offset + limit if len(rows) > limit else None,
    )


@router.get("/{rx_id}", response_model=PrescriptionOut)
async def detail(
    patient_id: UUID, rx_id: UUID, db=DbSession, principal=CurrentPrincipalDep, lookup=Prescriber
):
    from fastapi import HTTPException

    if principal.subject != str(patient_id):
        await lookup(principal)
    patient = await service.authorize(db, principal, patient_id)
    actor = _principal_uuid(principal)
    rx = await service.load(db, patient, actor, rx_id)
    if actor == patient_id and rx.issued_at is None:
        raise HTTPException(404, "prescription not found")
    await record_access(db, actor, patient.id, "prescription_read", str(rx.id))
    return await service.output(db, patient, rx)


async def execute(patient_id, rx_id, operation, payload, request_id, db, principal, lookup):
    doctor = await lookup(principal)
    return await service.command(
        db, principal, patient_id, rx_id, operation, payload, request_id, doctor
    )


@router.post("", response_model=PrescriptionOut, status_code=201)
async def create(
    patient_id: UUID,
    payload: PrescriptionDraft,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
    lookup=Prescriber,
):
    return await execute(
        patient_id, None, "create", payload, idempotency_key, db, principal, lookup
    )


@router.put("/{rx_id}", response_model=PrescriptionOut)
async def update(
    patient_id: UUID,
    rx_id: UUID,
    payload: DraftUpdate,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
    lookup=Prescriber,
):
    return await execute(
        patient_id, rx_id, "update", payload, idempotency_key, db, principal, lookup
    )


@router.post("/{rx_id}/issue", response_model=PrescriptionOut)
async def issue(
    patient_id: UUID,
    rx_id: UUID,
    payload: IssuePrescription,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
    lookup=Prescriber,
):
    return await execute(
        patient_id, rx_id, "issue", payload, idempotency_key, db, principal, lookup
    )


@router.post("/{rx_id}/cancel", response_model=PrescriptionOut)
async def cancel(
    patient_id: UUID,
    rx_id: UUID,
    payload: ChangePrescription,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
    lookup=Prescriber,
):
    return await execute(
        patient_id, rx_id, "cancel", payload, idempotency_key, db, principal, lookup
    )


@router.post("/{rx_id}/correct", response_model=PrescriptionOut)
async def correct(
    patient_id: UUID,
    rx_id: UUID,
    payload: ChangePrescription,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
    lookup=Prescriber,
):
    return await execute(
        patient_id, rx_id, "correct", payload, idempotency_key, db, principal, lookup
    )


@router.post("/{rx_id}/route", response_model=PrescriptionOut)
async def route(
    patient_id: UUID,
    rx_id: UUID,
    payload: RoutePrescription,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
    lookup=Prescriber,
):
    return await execute(
        patient_id, rx_id, "route", payload, idempotency_key, db, principal, lookup
    )


@router.post("/{rx_id}/retry", response_model=PrescriptionOut)
async def retry(
    patient_id: UUID,
    rx_id: UUID,
    payload: Versioned,
    idempotency_key: UUID = RequestKey,
    db=DbSession,
    principal=CurrentPrincipalDep,
    lookup=Prescriber,
):
    return await execute(
        patient_id, rx_id, "retry", payload, idempotency_key, db, principal, lookup
    )

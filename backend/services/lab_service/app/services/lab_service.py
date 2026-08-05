from __future__ import annotations

from datetime import timezone
import json
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models

from shared.audit import audited_read
from shared.auth import Principal

from ..config import settings
from ..models import AccessAudit, LabOrder, LabResult
from ..schemas.lab import LabOrderCreate, LabResultOut, LabResultUpload, LabSearchHitOut, LabSearchResultsOut, LabSummaryOut


class LabError(ValueError):
    pass


EMBEDDING_DIMENSION = 8


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _embed_text(text: str) -> list[float]:
    buckets = [0.0] * EMBEDDING_DIMENSION
    normalized = text.lower()
    for index, character in enumerate(normalized):
        buckets[index % EMBEDDING_DIMENSION] += float(ord(character))
    magnitude = sum(value * value for value in buckets) ** 0.5 or 1.0
    return [value / magnitude for value in buckets]


def _result_text(result: LabResult) -> str:
    payload = result.parsed_values or {}
    payload_text = json.dumps(payload, sort_keys=True) if payload else ""
    parts = [result.title, result.summary or "", result.raw_text or "", payload_text]
    return " ".join(part for part in parts if part).strip()


def build_qdrant_client() -> QdrantClient:
    client = QdrantClient(location=":memory:")
    if client.collection_exists(settings.qdrant_collection):
        client.delete_collection(settings.qdrant_collection)
    client.create_collection(
        collection_name=settings.qdrant_collection,
        vectors_config=qdrant_models.VectorParams(size=settings.qdrant_vector_size, distance=qdrant_models.Distance.COSINE),
    )
    return client


def _collection_filter(patient_id: UUID) -> qdrant_models.Filter:
    return qdrant_models.Filter(
        must=[qdrant_models.FieldCondition(key="patient_id", match=qdrant_models.MatchValue(value=str(patient_id)))]
    )


def index_lab_result(client: QdrantClient, result: LabResult) -> None:
    client.upsert(
        collection_name=settings.qdrant_collection,
        points=[
            qdrant_models.PointStruct(
                id=str(result.result_id),
                vector=_embed_text(_result_text(result)),
                payload={
                    "result_id": str(result.result_id),
                    "patient_id": str(result.patient_id),
                    "lab_order_id": str(result.lab_order_id) if result.lab_order_id is not None else None,
                    "title": result.title,
                    "source": result.source,
                    "status": result.status,
                    "resulted_at": result.resulted_at.isoformat() if result.resulted_at is not None else None,
                },
            )
        ],
    )


def _ensure_role(principal: Principal, allowed_roles: set[str], message: str) -> None:
    if principal.role not in allowed_roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, message)


async def _can_access_result(
    db: AsyncSession, principal: Principal, result: LabResult
) -> str:
    """Who may read a lab result. Returns the ACCESS MODE that permitted it.

    The return value exists for the audit trail: `"self"`,
    `"ordering_clinician"` or `"admin_override"`. Same idea as
    `ehr_service._authorize_patient_access`, which returns its mode for
    the same reason — the caller cannot re-derive "was this an admin
    override?" from a bare `None`, and guessing it from `principal.role`
    at the call site would mislabel an admin reading their OWN results.
    Authorization behaviour is unchanged; only the return type moved.

    THE `role == "doctor"` BLANKET GRANT IS GONE (2026-08-05, security review).
    It read:

        if principal.role == "doctor":
            return

    — no ordering relationship, no consent, no care team. Any account holding the
    doctor role could read ANY patient's result: `raw_text`, `parsed_values`,
    `summary`, `external_url`. Special-category health data of every patient in
    the system, behind a role claim.

    It was not even hard to obtain that claim: `POST /v1/auth/signup` accepted a
    client-supplied `role` and minted a token with it (fixed in the same pass), so
    the two defects chained into an UNAUTHENTICATED read of any patient's labs.

    The replacement is the predicate the ordering doctor genuinely has: they
    ordered the test. `LabOrder.ordered_by_user_id` is the relationship the data
    model already records, so no new column and no cross-service call is needed.

    Deliberately NOT accepted as sufficient:
      * role alone — the defect being removed.
      * "any doctor at the same hospital" — `hospital_admin` and hospital staff
        rows are self-assignable today (see the same review), so that would be a
        second role-claim bypass wearing a relationship's clothes.

    `ehr_service` already models this properly with an active `Consent` row
    (`record_service.py:56`). Lab results should converge on that consent model
    rather than keep a second, weaker rule — FLAGGED, and the reason this function
    takes the order relationship as a narrow first step instead of inventing a
    consent table here.

    Regulation: Ghana Act 843 s.20 (purpose limitation — access outside the
    treating relationship is a new purpose with no lawful basis) and s.28
    (safeguards); HIPAA §164.312(a)(1) access control and §164.308(a)(4) minimum
    necessary; GDPR Art. 9, which permits health-data processing for care only
    under a treating relationship (Art. 9(2)(h)).
    """
    if principal.role == "admin":
        # An admin reading someone else's result is an override and is
        # tagged as one; an admin reading their own is just "self".
        return "self" if result.patient_id == _principal_uuid(principal) else "admin_override"
    if result.patient_id == _principal_uuid(principal):
        return "self"
    # The ordering clinician, and only for the order this result belongs to.
    #
    # Loaded EXPLICITLY, because `LabResult` has no `relationship()` to its order
    # - only a nullable `lab_order_id` FK. A first version of this reached for
    # `result.order`, which does not exist: `getattr` would have returned None
    # forever and 403'd the ordering doctor on every request. It would have failed
    # closed, which is the right direction to fail, but it would have been broken.
    #
    # A result with no `lab_order_id` has no clinician who can claim a
    # relationship to it, so it never enters this branch. Absence of a
    # relationship must not read as permission.
    if principal.role == "doctor" and result.lab_order_id is not None:
        order = await db.get(LabOrder, result.lab_order_id)
        if order is not None and order.ordered_by_user_id == _principal_uuid(principal):
            return "ordering_clinician"
    raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only access your own lab results")


async def create_lab_order(db: AsyncSession, principal: Principal, payload: LabOrderCreate) -> LabOrder:
    _ensure_role(principal, {"doctor", "admin"}, "doctor access required")
    if payload.due_at is not None and payload.due_at.tzinfo is None:
        raise LabError("due_at must be timezone-aware")

    order = LabOrder(
        patient_id=payload.patient_id,
        ordered_by_user_id=_principal_uuid(principal),
        test_name=payload.test_name.strip(),
        priority=payload.priority.strip() or "routine",
        instructions=_normalize_text(payload.instructions),
        due_at=payload.due_at,
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)
    return order


async def upload_lab_result(db: AsyncSession, principal: Principal, payload: LabResultUpload) -> LabResult:
    uploader_id = _principal_uuid(principal)
    patient_id = payload.patient_id
    order: LabOrder | None = None

    if payload.lab_order_id is not None:
        order = await db.get(LabOrder, payload.lab_order_id)
        if order is None:
            raise LabError("lab order not found")
        if patient_id is not None and patient_id != order.patient_id:
            raise LabError("patient_id does not match the lab order")
        patient_id = order.patient_id

    if patient_id is None:
        raise LabError("patient_id is required")

    if principal.role == "patient" and patient_id != uploader_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "patients can only upload their own results")

    _ensure_role(principal, {"patient", "doctor", "admin", "lab_partner"}, "lab upload access required")

    result = LabResult(
        patient_id=patient_id,
        lab_order_id=payload.lab_order_id if order is not None else payload.lab_order_id,
        uploaded_by_user_id=uploader_id,
        source=payload.source.strip() or "patient_upload",
        title=payload.title.strip(),
        summary=_normalize_text(payload.summary),
        file_name=_normalize_text(payload.file_name),
        mime_type=_normalize_text(payload.mime_type),
        storage_key=_normalize_text(payload.storage_key),
        external_url=_normalize_text(payload.external_url),
        resulted_at=payload.resulted_at,
        raw_text=_normalize_text(payload.raw_text),
        parsed_values=payload.parsed_values,
    )
    db.add(result)
    await db.flush()
    await db.refresh(result)
    return result


async def get_lab_result(db: AsyncSession, principal: Principal, result_id: UUID) -> LabResult:
    """Read one lab result. AUDITED — both outcomes.

    A clinician read is exactly the access worth logging: `_can_access_result`
    now admits the ORDERING clinician, so a doctor can legitimately read a
    result belonging to someone who is not them, and the only record that this
    happened is the row written here.

    The `db.get` sits OUTSIDE the audited block on purpose. A `result_id` that
    does not exist has no patient to attribute an attempt to, so it produces no
    row — see `shared.audit.recorder.audited_read`. The `LabError` also carries
    no subject, so nothing is lost.
    """
    result = await db.get(LabResult, result_id)
    if result is None:
        raise LabError("lab result not found")
    async with audited_read(db, AccessAudit, principal, "lab_result", resource_id=result_id) as audit:
        # Set BEFORE the authorization check, so a 403 records *whose* result
        # was refused and not merely that something was refused.
        audit.patient_id = result.patient_id
        mode = await _can_access_result(db, principal, result)
        audit.admin_override = mode == "admin_override"
    return result


async def list_my_results(db: AsyncSession, principal: Principal) -> list[LabResult]:
    """AUDITED. A self-read is still a disclosure and still gets a row.

    `record_count` is the number of results handed over — a count, not
    content. It is what makes this row useful for scoping a breach
    notification instead of just proving the endpoint was called.
    """
    patient_id = _principal_uuid(principal)
    async with audited_read(db, AccessAudit, principal, "lab_result_list") as audit:
        audit.patient_id = patient_id
        stmt = select(LabResult).where(LabResult.patient_id == patient_id).order_by(LabResult.resulted_at.desc().nullslast(), LabResult.created_at.desc())
        result = await db.scalars(stmt)
        results = list(result.all())
        audit.record_count = len(results)
    return results


async def search_my_results(db: AsyncSession, principal: Principal, query: str, qdrant_client: QdrantClient, *, limit: int = 5) -> LabSearchResultsOut:
    """AUDITED.

    **`query` is NOT recorded.** A search over one's own lab results is a
    sentence about a symptom or a diagnosis — "hiv", "biopsy", "hcg" — and it is
    frequently more sensitive than the results it finds. Putting it in the audit
    table would make the audit table the most sensitive store in the platform,
    with the longest retention. The row says a search happened, by whom, over
    whose data, and how many results came back. That is enough to answer "who
    read this patient's record?" and no more than that.
    """
    patient_id = _principal_uuid(principal)
    async with audited_read(db, AccessAudit, principal, "lab_result_search") as audit:
        audit.patient_id = patient_id
        results = await _search_my_results(db, query, qdrant_client, patient_id, limit=limit)
        audit.record_count = len(results.items)
    return results


async def _search_my_results(
    db: AsyncSession,
    query: str,
    qdrant_client: QdrantClient,
    patient_id: UUID,
    *,
    limit: int = 5,
) -> LabSearchResultsOut:
    response = qdrant_client.query_points(
        collection_name=settings.qdrant_collection,
        query=_embed_text(query),
        query_filter=_collection_filter(patient_id),
        limit=limit,
        with_payload=True,
    )
    points = response.points
    result_ids = []
    for point in points:
        payload = point.payload or {}
        result_id = payload.get("result_id")
        if result_id:
            result_ids.append(UUID(str(result_id)))

    if not result_ids:
        return LabSearchResultsOut(query=query)

    stmt = select(LabResult).where(LabResult.id.in_(result_ids))
    rows = await db.scalars(stmt)
    results_by_id = {result.id: result for result in rows.all()}

    items: list[LabSearchHitOut] = []
    for point in points:
        payload = point.payload or {}
        result_id = payload.get("result_id")
        if not result_id:
            continue
        result = results_by_id.get(UUID(str(result_id)))
        if result is None:
            continue
        items.append(LabSearchHitOut(score=float(point.score or 0.0), result=LabResultOut.model_validate(result)))

    return LabSearchResultsOut(query=query, items=items)


async def get_lab_summary(db: AsyncSession, principal: Principal) -> LabSummaryOut:
    """AUDITED. Not in the brief's minimum list, added because it returns
    the three most recent results in full, which is a PHI read by any
    reading of it — leaving it out would have been an arbitrary hole in
    the same service."""
    patient_id = _principal_uuid(principal)
    async with audited_read(db, AccessAudit, principal, "lab_summary") as audit:
        audit.patient_id = patient_id
        summary = await _lab_summary(db, patient_id)
        audit.record_count = len(summary.recent_results)
    return summary


async def _lab_summary(db: AsyncSession, patient_id: UUID) -> LabSummaryOut:
    totals_stmt = select(
        func.count(LabOrder.id),
        func.count(LabOrder.id).filter(LabOrder.status == "ordered"),
    ).where(LabOrder.patient_id == patient_id)
    totals_result = await db.execute(totals_stmt)
    order_count, open_order_count = totals_result.one()

    total_results_stmt = select(func.count(LabResult.id)).where(LabResult.patient_id == patient_id)
    total_results = await db.scalar(total_results_stmt)

    recent_results_stmt = (
        select(LabResult)
        .where(LabResult.patient_id == patient_id)
        .order_by(LabResult.resulted_at.desc().nullslast(), LabResult.created_at.desc())
        .limit(3)
    )
    recent_results_result = await db.scalars(recent_results_stmt)
    recent_results = list(recent_results_result.all())

    return LabSummaryOut(
        total_orders=order_count or 0,
        open_orders=open_order_count or 0,
        total_results=total_results or 0,
        recent_results=[LabResultOut.model_validate(result) for result in recent_results],
    )
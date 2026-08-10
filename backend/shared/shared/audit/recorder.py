"""Writing the audit row: the helper, and the failure-mode decision.

THE FAILURE MODE — FAIL CLOSED
------------------------------
**If the audit row cannot be written, the read does not happen.** The
caller gets `503 access audit unavailable` and no patient data.

The trade-off, stated plainly: this couples read availability to the
audit table. A broken `access_audit` table takes the audited read paths
down with it, and in a clinical system unavailability is itself a harm —
that is the real argument for the other choice.

It is chosen anyway, for three reasons specific to this system:

1. It is what `ehr_service` already does. Its `record_access` does
   `session.add(...)` then `await session.flush()` inside the request's
   transaction with no `try`, so a failing audit write already fails the
   read there. Making the other five services fail *open* would mean the
   platform's answer to "was this disclosure recorded?" depended on which
   service you asked. One model applied consistently is the point of this
   change.

2. Fail-open is silent by construction. A disclosure that happened with
   no record of it is indistinguishable, afterwards, from a disclosure
   that never happened — and "we cannot reconstruct who accessed what" is
   exactly the position that makes a GDPR Art. 33 notification
   impossible to complete and an Act 843 s.29 demonstration of
   compliance impossible to make. Fail-closed converts that permanent,
   invisible gap into a loud, immediate, fixable outage.

3. The write is not a plausible independent failure. It is one INSERT,
   no foreign keys, on the same session and connection that just
   satisfied the read. There is no realistic state where the read query
   succeeds and this INSERT fails except "the database is unhealthy" or
   "the migration has not run" — in the first case the read was going to
   fail anyway, and the second is a deployment error that should be
   discovered on the first request rather than months later by an
   investigator finding an empty table.

Whichever way it goes, **the failure is never swallowed**: it is logged
at ERROR with the identifiers needed to find it (and nothing else), and
then raised. There is no `except Exception: pass` in this module.

NOT AN APPLICATION LOG
----------------------
The trail is the database table. The `logger` calls here are for
operators watching for audit *failures*; they are not the audit trail.
The security review rejected application logs for this: no retention
policy, no per-subject query, and shipped off to wherever logs go. Do not
"simplify" this module into a log line.
"""

from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Iterable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from .model import OUTCOME_DENIED, OUTCOME_GRANTED

logger = logging.getLogger(__name__)

#: HTTP statuses that mean "authorization refused", i.e. the ones worth a
#: `denied` row. A 404 is NOT here: a read of a resource that does not
#: exist has no data subject to log the attempt against, so the row would
#: be a probe log rather than an access log. Probe detection is a
#: different feature with a different table (flagged, not built).
DENIAL_STATUS_CODES = frozenset({status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})


class AuditWriteError(RuntimeError):
    """Raised when the audit row could not be persisted.

    Callers should not catch this to continue — see the failure-mode note
    above. It exists so tests can assert on the fail-closed behaviour
    without matching on an HTTP status.
    """


def principal_identity(principal: Any) -> tuple[UUID, str]:
    """Return `(user_id, role)` from a principal.

    Accepts both the `shared.auth.Principal` dataclass and the plain
    dict that `telemedicine_service` / `inbox_service` return from their
    own `get_current_principal`. Those two services diverge from the rest
    and normalising them is out of scope here; this function absorbs the
    difference so no audit call site has to know which it is holding.
    """
    if isinstance(principal, dict):
        subject, role = principal.get("subject"), principal.get("role")
    else:
        subject, role = getattr(principal, "subject", None), getattr(principal, "role", None)
    try:
        user_id = UUID(str(subject))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc
    return user_id, str(role or "")


async def record_access(
    session: AsyncSession,
    audit_model: type,
    *,
    accessor_user_id: UUID,
    accessor_role: str,
    resource: str,
    resource_id: UUID | None = None,
    patient_id: UUID | None = None,
    outcome: str = OUTCOME_GRANTED,
    admin_override: bool = False,
    record_count: int | None = None,
) -> None:
    """Write exactly one row to the calling service's `access_audit`.

    `audit_model` is the service's own `AccessAudit` class — passed in
    rather than looked up, because per-service databases mean there is no
    single model to import and an implicit registry would be one more
    thing to get wrong at import time.

    Transaction handling differs by outcome, and this is load-bearing:

      * `granted` — `flush()` only. The row lands in the SAME transaction
        as the read, so it commits with the request (every service's
        `get_db` commits on success). Atomic: you cannot have served the
        data and lost the record of serving it.

      * `denied` — `flush()` then `commit()`. A denial is followed
        immediately by a raised 403, and every service's `get_db` calls
        `session.rollback()` on an exception — which would throw the
        denial row away. Committing it first is what makes "log denials
        too" actually true rather than aspirational. There is a
        regression test pinning this. Precondition: only call the denied
        path at an authorization boundary, before any other write is
        pending; the guard below shouts if that is ever violated.
    """
    row = audit_model(
        accessor_user_id=accessor_user_id,
        accessor_role=accessor_role,
        resource=resource,
        resource_id=resource_id,
        patient_id=patient_id,
        outcome=outcome,
        admin_override=admin_override,
        record_count=record_count,
    )

    if outcome == OUTCOME_DENIED:
        # Guard, not a fix: if anything else is pending, the commit below
        # would durably write it. That would be a call-discipline bug at
        # the call site, so make it findable rather than silent. No PHI —
        # counts only.
        pending_other = len(session.new) + len(session.dirty) + len(session.deleted)
        if pending_other:
            logger.error(
                "audit.denied_write_with_pending_changes resource=%s pending=%d "
                "— a denial audit commit is flushing unrelated pending writes; "
                "record the denial at the authorization boundary instead",
                resource,
                pending_other,
            )

    session.add(row)
    try:
        await session.flush()
        if outcome == OUTCOME_DENIED:
            await session.commit()
    except Exception as exc:  # noqa: BLE001 — re-raised below, never swallowed
        # LOUD. Identifiers and the outcome only: an audit-failure log line
        # is not a licence to put the content into the logs instead.
        logger.error(
            "audit.write_failed resource=%s resource_id=%s accessor=%s outcome=%s error=%s",
            resource,
            resource_id,
            accessor_user_id,
            outcome,
            type(exc).__name__,
            exc_info=True,
        )
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "access audit unavailable",
        ) from AuditWriteError(f"could not record {outcome} access to {resource}")


@dataclass
class AccessContext:
    """Mutable audit facts, filled in as the read discovers them.

    A read learns *whose* data it is and *whether* an override was used
    only after it has loaded the row and run the authorization check, so
    those cannot be arguments to a decorator. They are set on this object
    inside the `async with` body and read when the row is written.
    """

    resource: str
    resource_id: UUID | None = None
    patient_id: UUID | None = None
    admin_override: bool = False
    record_count: int | None = None


@asynccontextmanager
async def audited_read(
    session: AsyncSession,
    audit_model: type,
    principal: Any,
    resource: str,
    *,
    resource_id: UUID | None = None,
    patient_id: UUID | None = None,
):
    """Wrap a read so that BOTH outcomes are recorded.

        async with audited_read(db, AccessAudit, principal, "lab_result",
                                resource_id=result_id) as audit:
            result = await db.get(LabResult, result_id)
            audit.patient_id = result.patient_id
            await _can_access_result(db, principal, result)   # may 403
            audit.admin_override = ...

    On a clean exit: one `granted` row. On a 401/403 raised anywhere in
    the body: one `denied` row, committed, and the exception re-raised
    unchanged so the caller's HTTP contract does not move. On any other
    exception (a 404, a `LabError`, a bug): no row and the exception
    propagates — nothing was disclosed and, for a resource that does not
    exist, there is no subject to attribute the attempt to.

    Assign to `audit.patient_id` as early as the read allows: on the
    denied path, a `patient_id` set before the authorization check is the
    difference between "somebody was refused something" and "somebody was
    refused *this patient's* record", and only the second is useful.
    """
    accessor_user_id, accessor_role = principal_identity(principal)
    ctx = AccessContext(resource=resource, resource_id=resource_id, patient_id=patient_id)
    try:
        yield ctx
    except HTTPException as exc:
        if exc.status_code in DENIAL_STATUS_CODES:
            await record_access(
                session,
                audit_model,
                accessor_user_id=accessor_user_id,
                accessor_role=accessor_role,
                resource=ctx.resource,
                resource_id=ctx.resource_id,
                patient_id=ctx.patient_id,
                outcome=OUTCOME_DENIED,
                admin_override=ctx.admin_override,
            )
        raise
    else:
        await record_access(
            session,
            audit_model,
            accessor_user_id=accessor_user_id,
            accessor_role=accessor_role,
            resource=ctx.resource,
            resource_id=ctx.resource_id,
            patient_id=ctx.patient_id,
            outcome=OUTCOME_GRANTED,
            admin_override=ctx.admin_override,
            record_count=ctx.record_count,
        )


async def record_collection_access(
    session: AsyncSession,
    audit_model: type,
    principal: Any,
    resource: str,
    *,
    patient_ids: Iterable[UUID] = (),
    resource_id: UUID | None = None,
    record_count: int | None = None,
    admin_override: bool = False,
) -> int:
    """Record a read that spans many records. **One row per DATA SUBJECT.**

    Returns the number of rows written, so a caller (or a test) can assert
    on it.

    The rule, and why it is not "one row per collection read":

      * A read that exposes N patients writes N rows, one per distinct
        patient, each carrying that patient's own `record_count`. This is
        what makes "who read THIS patient's record?" answerable for a list
        endpoint — a single row with `patient_id = NULL` and
        `record_count = 40` cannot be found by a query for one subject,
        which is precisely the Act 843 s.32-35 question. A doctor's
        schedule is tens of rows, not thousands; the volume is the price
        of the log being useful.

      * A read that exposes NO patient (e.g. a hospital's staff roster —
        the subjects are employees, and the institution is not a data
        subject at all) writes exactly ONE row with `patient_id = NULL`
        and the collection's size in `record_count`. The read still
        happened and must still be attributable.

    A single-subject collection read (a patient listing their own results)
    is the N=1 case and lands on the same rule: one row.
    """
    accessor_user_id, accessor_role = principal_identity(principal)
    counts = Counter(pid for pid in patient_ids if pid is not None)

    if not counts:
        await record_access(
            session,
            audit_model,
            accessor_user_id=accessor_user_id,
            accessor_role=accessor_role,
            resource=resource,
            resource_id=resource_id,
            patient_id=None,
            outcome=OUTCOME_GRANTED,
            admin_override=admin_override,
            record_count=0 if record_count is None else record_count,
        )
        return 1

    for patient_id, count in counts.items():
        await record_access(
            session,
            audit_model,
            accessor_user_id=accessor_user_id,
            accessor_role=accessor_role,
            resource=resource,
            resource_id=resource_id,
            patient_id=patient_id,
            outcome=OUTCOME_GRANTED,
            admin_override=admin_override,
            record_count=count,
        )
    return len(counts)


@dataclass
class CollectionAccessContext:
    """Audit facts for a multi-record read, filled in inside the block."""

    resource: str
    resource_id: UUID | None = None
    #: Append one entry per RECORD returned, not per distinct patient —
    #: `record_collection_access` does the grouping and the per-subject
    #: counts, so the call site never has to.
    patient_ids: list[UUID] = field(default_factory=list)
    #: Collection size, used only when `patient_ids` is empty (a read with
    #: no patient data subject).
    record_count: int | None = None
    admin_override: bool = False


@asynccontextmanager
async def audited_collection_read(
    session: AsyncSession,
    audit_model: type,
    principal: Any,
    resource: str,
    *,
    resource_id: UUID | None = None,
):
    """`audited_read` for a multi-record read.

    On a clean exit: `record_collection_access` semantics (one row per
    data subject, or one subject-less row). On a 401/403 from the body:
    ONE `denied` row with `patient_id = NULL` — a refused list read has no
    subjects, because the query that would have found them never ran, and
    inventing a subject for the denial would be a fabricated fact in an
    audit log.
    """
    ctx = CollectionAccessContext(resource=resource, resource_id=resource_id)
    accessor_user_id, accessor_role = principal_identity(principal)
    try:
        yield ctx
    except HTTPException as exc:
        if exc.status_code in DENIAL_STATUS_CODES:
            await record_access(
                session,
                audit_model,
                accessor_user_id=accessor_user_id,
                accessor_role=accessor_role,
                resource=ctx.resource,
                resource_id=ctx.resource_id,
                patient_id=None,
                outcome=OUTCOME_DENIED,
                admin_override=ctx.admin_override,
            )
        raise
    else:
        await record_collection_access(
            session,
            audit_model,
            principal,
            ctx.resource,
            patient_ids=ctx.patient_ids,
            resource_id=ctx.resource_id,
            record_count=ctx.record_count,
            admin_override=ctx.admin_override,
        )

"""The PHI access-audit row: one shape, adopted by every service.

WHY THIS LIVES IN `shared` AND NOT IN A CENTRAL SERVICE
-------------------------------------------------------
This is `ehr_service`'s `AccessAudit` table (`app/models/record.py:57`)
lifted into a mixin so the other services can adopt the *same* shape
instead of each inventing one. A second, divergent audit design is worse
than one design applied unevenly: a reviewer answering "who read this
patient's record?" would have to learn N schemas and N semantics, and
would get the answer wrong in whichever one they misread.

MedApp runs per-service databases, so **each service owns its own
`access_audit` table**. There is deliberately no central audit table
reached over the network: an audit write that depends on another service
being up is an audit write that fails exactly when things are going
wrong, and it would make the write a distributed transaction with the
read it is supposed to be atomic with. Aggregation for a
platform-wide "who touched patient X" report is a read-side concern
(query each service, union on `patient_id`) and is NOT solved here — see
the gaps note at the bottom of this docstring.

WHAT A ROW CAPTURES
-------------------
  who         `accessor_user_id` + `accessor_role`
  what        `resource` (type) + `resource_id` (nullable — a collection
              read has no single id)
  whose       `patient_id` (nullable — some audited reads have no single
              patient, e.g. a hospital staff roster)
  when        `created_at`
  outcome     `outcome` — `granted` or `denied`. Denials are logged; a
              denied attempt is the most interesting line in the log.
  override    `admin_override` — a boolean column, so finding every
              operator access is `WHERE admin_override IS TRUE` rather
              than a `LIKE '[admin_override]%'` scan of a text field.
  scale       `record_count` — how many rows the caller was handed. Not
              personal data, and it is what turns "a list endpoint was
              called" into "this many data subjects were exposed", which
              is precisely the number a GDPR Art. 33 notification needs
              within 72 hours.

WHAT A ROW MUST NEVER CAPTURE
-----------------------------
No clinical content. No `reason`, `notes`, `raw_text`, `parsed_values`,
`summary`, no search query text, no message bodies, no titles, no free
text of any kind. There is no free-text column on this table at all,
which is the enforcement mechanism — you cannot leak into a column that
does not exist. An audit log containing PHI is a second copy of the PHI
with a longer retention period, i.e. the exact opposite of the point.

This is the ONE place the shape deliberately diverges from
`ehr_service`: that table has a NOT NULL `reason VARCHAR(255)` which is
fed partly from a caller-supplied string, and it is also where the
admin-override tag is smuggled in as a text prefix. `reason` expresses
none of the six things a row must capture, so it is not carried over;
the override signal it was carrying gets a real boolean column.
`ehr_service`'s own `reason` column is left alone by this change and is
recorded as a remaining gap.

RETENTION POSITION (Ghana Act 843 s.24 — no longer than necessary)
------------------------------------------------------------------
**Six years from `created_at`, then delete.** Six years is HIPAA
§164.316(b)(2)(i)'s retention period for required documentation, and
adopting it for the access log keeps one number for the whole platform
rather than a per-service argument. It is bounded, which is what s.24
requires — an undefined retention is the violation, not a long one.

Expiry is NOT implemented here (no scheduled job yet); this comment is
the stated position, so the next person implements a purge instead of
deciding the policy. The purge is deliberately cheap to write because
rows hold identifiers only: `DELETE FROM access_audit WHERE created_at <
now() - interval '6 years'`, with no clinical content to redact and no
dependency on any other table.

KNOWN GAPS (see the PIPELINE entry accompanying this change)
------------------------------------------------------------
  * `patient_id` is not one id space across services. In `ehr_service`
    it is the local `patients.id`; everywhere else it is the patient's
    user_service **user id**. A cross-service report must join through
    `patients.user_id`. Renaming ehr's column was out of scope for this
    pass and is flagged rather than half-done.
  * No purge job.
  * No cross-service aggregation query.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import TimestampMixin

#: Outcome values. Two, and only two — `granted` means data was handed
#: over, `denied` means authorization refused. Anything else (a 404 for a
#: resource that does not exist) is not an access to a data subject's
#: data and does not belong in an access log; see `recorder.audited_read`.
OUTCOME_GRANTED = "granted"
OUTCOME_DENIED = "denied"

#: Table name, identical in every service that adopts the mixin. Kept as
#: a constant so migrations and any hand-written report SQL agree.
ACCESS_AUDIT_TABLE = "access_audit"


class AccessAuditMixin(TimestampMixin):
    """Declarative mixin — a service adopts it with:

        from shared.audit import AccessAuditMixin
        from shared.db import Base

        class AccessAudit(Base, AccessAuditMixin):
            pass

    `__tablename__` comes from the mixin so no service can accidentally
    name its table something else and break a cross-service report.
    `TimestampMixin` supplies `id`, `created_at` (the "when") and
    `updated_at`. Rows are append-only in practice: nothing in
    `shared.audit` ever updates one, and `updated_at` exists only to keep
    the shape identical to every other table in this codebase.
    """

    __tablename__ = ACCESS_AUDIT_TABLE

    # WHO. The verified token subject, never a client-supplied id.
    accessor_user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    # The role the accessor was acting under at the time of the read. It
    # is stored rather than looked up later because roles change, and the
    # question a reviewer asks is "what were they entitled to *then*".
    accessor_role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    # WHAT. `resource` is a closed vocabulary of type names owned by each
    # service (e.g. "lab_result", "booking_schedule"); `resource_id` is
    # NULL for a collection read.
    resource: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    resource_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True, index=True
    )

    # WHOSE DATA. Nullable: a hospital staff roster read has no single
    # patient, and forcing a value here would mean inventing one. Indexed
    # because "who read this patient's record?" is the query this whole
    # table exists to answer, and it must not be a full scan.
    patient_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True, index=True
    )

    # OUTCOME.
    outcome: Mapped[str] = mapped_column(
        String(16), nullable=False, index=True, server_default=OUTCOME_GRANTED
    )

    # ADMIN OVERRIDE — a real column, queryable, not a text prefix.
    admin_override: Mapped[bool] = mapped_column(
        Boolean, nullable=False, index=True, server_default="false"
    )

    # SCALE. How many records were handed over. NULL for a single-record
    # read (where the answer is 1 and `resource_id` already says which).
    record_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    @property
    def audit_id(self) -> UUID:
        # Mirrors the `<thing>_id` property convention used by every
        # other model in this codebase, including ehr's AccessAudit.
        return self.id

"""create access_audit (PHI access trail) for inbox_service

Revision ID: 20260805_0002
Revises: 20260518_0001
Create Date: 2026-08-05

WHAT AND WHY
------------
Before this revision, inbox_service could not answer "who read this patient's
record?" at all. `ehr_service` has been writing an `AccessAudit` row on
every read for months; nothing comparable existed here, which left the
platform with an audit trail for one service and none for the reads that
expose clinical message threads.

The obligations are explicit, not best-effort: HIPAA §164.312(b) audit
controls is a REQUIRED implementation specification (not addressable);
Ghana Act 843 s.29 requires the controller to be able to DEMONSTRATE
compliance, and s.32-35 give the data subject an access right that cannot
be answered without a per-subject access log; GDPR Art. 33's 72-hour
breach notification is unmeetable if you cannot reconstruct who accessed
what.

SHAPE
-----
Identical in every service, and defined once in
`shared.audit.table.access_audit_columns()` rather than copied into five
migrations that would then drift. Identifiers and outcomes only — there
is no free-text column on this table, which is how "the audit log must
not contain PHI" is enforced rather than merely intended. The retention
position (six years, then delete) is stated in
`shared.audit.model.AccessAuditMixin`.

IDEMPOTENCE
-----------
`create_access_audit_table` wraps everything in the
`sa.inspect(op.get_bind())` guard this repo already uses (see
`booking_service` revision 20260805_0003). It matters here because tests
and some dev setups build the schema with `Base.metadata.create_all`, so
the table can exist before Alembic runs — and because `user_service`
revision 0003 has already failed once on a clean database for exactly
this reason. The NOT NULL columns (`outcome`, `admin_override`) carry
`server_default`s, so creating the table alongside existing rows in the
database is safe.

DOWNGRADE DELETES THE AUDIT TRAIL. See `drop_access_audit_table`.
"""

from __future__ import annotations

from alembic import op

from shared.audit import create_access_audit_table, drop_access_audit_table

revision = "20260805_0002"
down_revision = "20260518_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    create_access_audit_table(op)


def downgrade() -> None:
    drop_access_audit_table(op)

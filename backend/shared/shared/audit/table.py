"""Alembic-friendly definition of the `access_audit` table.

Every service that adopts `AccessAuditMixin` needs a migration that
creates the same table. Hand-copying a nine-column `op.create_table`
into five `alembic/versions/` files is how five tables quietly drift
apart, so the column and index specs live here and each migration calls
them.

Deliberately NOT `Base.metadata` / autogenerate: a migration must be
readable and stable at the revision it was written, and it must not
change shape later because a model was edited. These functions return
FRESH `sa.Column` objects on every call — a `Column` binds to the first
table it is attached to, so returning module-level singletons would blow
up the second time they were used in one process.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from .model import ACCESS_AUDIT_TABLE, OUTCOME_GRANTED

__all__ = [
    "ACCESS_AUDIT_TABLE",
    "access_audit_columns",
    "access_audit_index_specs",
    "create_access_audit_table",
    "drop_access_audit_table",
]


def access_audit_columns() -> list[sa.Column]:
    """Columns of `access_audit`, in model order.

    `server_default` is set on `outcome` and `admin_override` because
    both are NOT NULL and the table may be created by a migration that
    runs against a database where a later backfill inserts rows through
    plain SQL. It costs nothing and it removes the failure mode this
    repo has already hit (a NOT NULL column added without a default).
    """
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("accessor_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("accessor_role", sa.String(length=32), nullable=False),
        sa.Column("resource", sa.String(length=64), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("outcome", sa.String(length=16), nullable=False, server_default=OUTCOME_GRANTED),
        sa.Column("admin_override", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("record_count", sa.Integer(), nullable=True),
    ]


def access_audit_index_specs() -> list[tuple[str, list[str]]]:
    """(index_name, columns) pairs.

    `patient_id` and `created_at` also get a COMPOSITE index because the
    real query is always "this subject, over this window" — a data
    subject exercising the Act 843 s.32-35 access right, or a breach
    investigation reconstructing a period. Two single-column indexes make
    the planner pick one and filter the rest.
    """
    return [
        (f"ix_{ACCESS_AUDIT_TABLE}_accessor_user_id", ["accessor_user_id"]),
        (f"ix_{ACCESS_AUDIT_TABLE}_accessor_role", ["accessor_role"]),
        (f"ix_{ACCESS_AUDIT_TABLE}_resource", ["resource"]),
        (f"ix_{ACCESS_AUDIT_TABLE}_resource_id", ["resource_id"]),
        (f"ix_{ACCESS_AUDIT_TABLE}_patient_id", ["patient_id"]),
        (f"ix_{ACCESS_AUDIT_TABLE}_outcome", ["outcome"]),
        (f"ix_{ACCESS_AUDIT_TABLE}_admin_override", ["admin_override"]),
        (f"ix_{ACCESS_AUDIT_TABLE}_patient_created", ["patient_id", "created_at"]),
    ]


def create_access_audit_table(op) -> None:
    """Idempotent create, for use inside `upgrade()`.

    Guarded with `sa.inspect(op.get_bind())` — the guard this repo
    already uses (`booking_service` revision 20260805_0003). It is not
    ceremony: `user_service` revision 0003 once failed on a clean
    database because the object already existed, and every service here
    also has a `Base.metadata.create_all` path (tests, some dev setups)
    that can produce the table before Alembic ever runs. A re-run must be
    a no-op, not a `DuplicateTable`.

    `op` is passed in rather than imported so this module has no
    import-time dependency on an Alembic migration context.
    """
    inspector = sa.inspect(op.get_bind())
    if ACCESS_AUDIT_TABLE not in set(inspector.get_table_names()):
        op.create_table(ACCESS_AUDIT_TABLE, *access_audit_columns())

    # Re-inspect: the table may have just been created, and on a partial
    # previous run the table can exist with only some of its indexes.
    existing = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(ACCESS_AUDIT_TABLE)}
    for name, columns in access_audit_index_specs():
        if name not in existing:
            op.create_index(name, ACCESS_AUDIT_TABLE, columns)


def drop_access_audit_table(op) -> None:
    """Idempotent drop, for use inside `downgrade()`.

    Note what a downgrade means here: **deleting the audit trail**. It
    exists so the migration is reversible in development; running it
    against an environment that has ever held real access records
    destroys evidence you are required to be able to produce. Export
    first.
    """
    inspector = sa.inspect(op.get_bind())
    if ACCESS_AUDIT_TABLE not in set(inspector.get_table_names()):
        return
    existing = {index["name"] for index in inspector.get_indexes(ACCESS_AUDIT_TABLE)}
    for name, _columns in access_audit_index_specs():
        if name in existing:
            op.drop_index(name, table_name=ACCESS_AUDIT_TABLE)
    op.drop_table(ACCESS_AUDIT_TABLE)

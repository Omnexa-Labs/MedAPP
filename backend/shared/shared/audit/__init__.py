"""PHI access audit trail — the reusable unit every service adopts.

Three pieces, deliberately separable:

  `model`     `AccessAuditMixin` — the row shape (see its docstring for
              what a row captures, what it must never capture, and the
              retention position).
  `table`     `create_access_audit_table(op)` — the idempotent Alembic
              create, so five migrations cannot drift apart.
  `recorder`  `record_access` / `audited_read` — the write helper and the
              context manager that records granted AND denied reads. The
              fail-closed decision and its justification are documented
              at the top of that module.

Adopting it in a service is three steps:

  1. `app/models/audit.py`:
         class AccessAudit(Base, AccessAuditMixin): pass
     and export it from `app/models/__init__.py`.
  2. An Alembic revision calling `create_access_audit_table(op)`.
  3. Wrap each PHI read in `audited_read(...)`.
"""

from .model import (
    ACCESS_AUDIT_TABLE,
    OUTCOME_DENIED,
    OUTCOME_GRANTED,
    AccessAuditMixin,
)
from .recorder import (
    AccessContext,
    AuditWriteError,
    CollectionAccessContext,
    audited_collection_read,
    audited_read,
    principal_identity,
    record_access,
    record_collection_access,
)
from .table import (
    access_audit_columns,
    access_audit_index_specs,
    create_access_audit_table,
    drop_access_audit_table,
)

__all__ = [
    "ACCESS_AUDIT_TABLE",
    "OUTCOME_DENIED",
    "OUTCOME_GRANTED",
    "AccessAuditMixin",
    "AccessContext",
    "AuditWriteError",
    "CollectionAccessContext",
    "access_audit_columns",
    "access_audit_index_specs",
    "audited_collection_read",
    "audited_read",
    "create_access_audit_table",
    "drop_access_audit_table",
    "principal_identity",
    "record_access",
    "record_collection_access",
]

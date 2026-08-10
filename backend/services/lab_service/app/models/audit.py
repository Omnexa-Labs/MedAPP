"""This service's own `access_audit` table.

Per-service databases mean the table is local: there is no central audit
database to reach over the network (see `shared.audit.model` for why
that is the right call and not a shortcut). The SHAPE is shared, so a
reviewer answering "who read this patient's record?" reads one schema
and can union the answer across services.

Nothing to declare here — every column, the retention position and the
"no clinical content" rule live in `shared.audit.model.AccessAuditMixin`.
Adding a column to this subclass would fork the shape; don't.
"""

from __future__ import annotations

from shared.audit import AccessAuditMixin
from shared.db import Base


class AccessAudit(Base, AccessAuditMixin):
    pass

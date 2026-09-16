"""Retain consent history while permitting fresh, time-limited grants."""
import sqlalchemy as sa
from alembic import op

revision = "20260913_0003"
down_revision = "20260807_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("uq_patient_doctor_scope", "consents", type_="unique")
    op.add_column("consents", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("consents", sa.Column("clinician_display_name", sa.String(511), nullable=True))
    op.add_column("consents", sa.Column("clinician_role", sa.String(16), nullable=True))
    op.add_column("consents", sa.Column("reason", sa.String(255), nullable=True))
    op.create_index("uq_active_patient_doctor_scope", "consents", ["patient_id", "doctor_user_id", "scope"],
                    unique=True, postgresql_where=sa.text("revoked_at IS NULL"))
    op.create_index("ix_consents_patient_granted", "consents", ["patient_id", "granted_at", "id"])


def downgrade():
    # Old schema cannot represent regrant history. Refuse instead of deleting records.
    duplicate = op.get_bind().execute(sa.text("SELECT 1 FROM consents GROUP BY patient_id, doctor_user_id, scope HAVING count(*) > 1 LIMIT 1")).first()
    finite = op.get_bind().execute(sa.text("SELECT 1 FROM consents WHERE expires_at IS NOT NULL LIMIT 1")).first()
    if duplicate or finite:
        raise RuntimeError("Time-limited consent/history cannot fit the old schema; retain this revision or archive new grants explicitly before rollback.")
    op.drop_index("ix_consents_patient_granted", table_name="consents")
    op.drop_index("uq_active_patient_doctor_scope", table_name="consents")
    for name in ("reason", "clinician_role", "clinician_display_name", "expires_at"):
        op.drop_column("consents", name)
    op.create_unique_constraint("uq_patient_doctor_scope", "consents", ["patient_id", "doctor_user_id", "scope"])

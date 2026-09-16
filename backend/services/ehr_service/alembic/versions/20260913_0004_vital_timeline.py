"""Index the patient timeline for bounded chronological reads."""
from alembic import op

revision = "20260913_0004"
down_revision = "20260913_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_vitals_patient_timeline", "vitals", ["patient_id", "recorded_at", "id"])


def downgrade():
    op.drop_index("ix_vitals_patient_timeline", table_name="vitals")

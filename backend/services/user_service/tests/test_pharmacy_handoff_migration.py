import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_pharmacy_target_migration_preserves_other_proofs_and_never_removes_target_binding_from_live_pharmacy_proofs(
    monkeypatch,
):
    path = Path(__file__).parents[1] / "alembic/versions/20260915_0011_pharmacy_handoff.py"
    spec = importlib.util.spec_from_file_location("pharmacy_handoff_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite:///:memory:")
    try:
        with engine.begin() as db:
            db.execute(
                sa.text(
                    "CREATE TABLE partner_handoffs (id INTEGER PRIMARY KEY, portal VARCHAR(16) NOT NULL)"
                )
            )
            db.execute(sa.text("INSERT INTO partner_handoffs VALUES (1,'partner'), (2,'hospital')"))
            monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(db)))
            migration.upgrade()
            assert db.execute(
                sa.text("SELECT pharmacy_id, deployment_key FROM partner_handoffs")
            ).all() == [(None, None), (None, None)]
            with pytest.raises(sa.exc.IntegrityError):
                db.execute(
                    sa.text("INSERT INTO partner_handoffs (id,portal) VALUES (3,'pharmacy')")
                )
            db.execute(
                sa.text(
                    "INSERT INTO partner_handoffs VALUES (3,'pharmacy','22222222222242228222222222222222','accra')"
                )
            )
            migration.downgrade()
            assert db.execute(sa.text("SELECT * FROM partner_handoffs ORDER BY id")).all() == [
                (1, "partner"),
                (2, "hospital"),
            ]
            migration.upgrade()
            assert db.execute(sa.text("SELECT count(*) FROM partner_handoffs")).scalar_one() == 2
    finally:
        engine.dispose()

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_portal_migration_preserves_onboarding_proofs_and_does_not_reinterpret_hospital_proofs(
    monkeypatch,
):
    path = Path(__file__).parents[1] / "alembic/versions/20260914_0010_hospital_handoff.py"
    spec = importlib.util.spec_from_file_location("hospital_handoff_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite:///:memory:")
    try:
        with engine.begin() as db:
            db.execute(
                sa.text(
                    "CREATE TABLE partner_handoffs (id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL)"
                )
            )
            db.execute(sa.text("INSERT INTO partner_handoffs VALUES (1, 'old-proof-hash')"))
            monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(db)))
            migration.upgrade()
            assert db.execute(sa.text("SELECT token_hash, portal FROM partner_handoffs")).one() == (
                "old-proof-hash",
                "partner",
            )
            db.execute(
                sa.text(
                    "INSERT INTO partner_handoffs VALUES (2, 'hospital-proof-hash', 'hospital')"
                )
            )
            migration.downgrade()
            assert db.execute(sa.text("SELECT id, token_hash FROM partner_handoffs")).all() == [
                (1, "old-proof-hash")
            ]
            migration.upgrade()
            assert (
                db.execute(sa.text("SELECT portal FROM partner_handoffs")).scalar_one() == "partner"
            )
    finally:
        engine.dispose()

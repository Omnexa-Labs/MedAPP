import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_session_migration_preserves_existing_tokens_and_supports_rollback(monkeypatch):
    path = Path(__file__).parents[1] / "alembic/versions/20260913_0005_session_families.py"
    spec = importlib.util.spec_from_file_location("session_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite:///:memory:")
    try:
        with engine.begin() as db:
            db.execute(sa.text("CREATE TABLE refresh_tokens (id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL)"))
            db.execute(sa.text("INSERT INTO refresh_tokens VALUES (1, 'synthetic-hash')"))
            monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(db)))
            migration.upgrade()
            row = db.execute(sa.text("SELECT * FROM refresh_tokens")).mappings().one()
            assert row["token_hash"] == "synthetic-hash"
            assert row["session_id"] is None and row["session_started_at"] is None
            migration.downgrade()
            assert {column["name"] for column in sa.inspect(db).get_columns("refresh_tokens")} == {"id", "token_hash"}
            assert db.execute(sa.text("SELECT token_hash FROM refresh_tokens")).scalar_one() == "synthetic-hash"
            migration.upgrade()
    finally:
        engine.dispose()

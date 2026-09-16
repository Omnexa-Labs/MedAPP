import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_handoff_migration_preserves_accounts_and_session_data(monkeypatch):
    path = Path(__file__).parents[1] / "alembic/versions/20260914_0008_partner_handoff.py"
    spec = importlib.util.spec_from_file_location("handoff_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite:///:memory:")
    try:
        with engine.begin() as db:
            db.execute(sa.text("CREATE TABLE users (id CHAR(32) PRIMARY KEY, email TEXT NOT NULL)"))
            db.execute(
                sa.text(
                    "INSERT INTO users VALUES ('11111111111141118111111111111111', 'qa@example.com')"
                )
            )
            db.execute(
                sa.text(
                    "CREATE TABLE refresh_tokens (id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL)"
                )
            )
            db.execute(sa.text("INSERT INTO refresh_tokens VALUES (1, 'existing-session-hash')"))
            monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(db)))
            migration.upgrade()
            assert {item["name"] for item in sa.inspect(db).get_indexes("partner_handoffs")} == {
                "ix_partner_handoffs_user_id",
                "ix_partner_handoffs_expires_at",
            }
            assert (
                sa.inspect(db).get_foreign_keys("partner_handoffs")[0]["referred_table"] == "users"
            )
            migration.downgrade()
            assert db.execute(sa.text("SELECT email FROM users")).scalar_one() == "qa@example.com"
            assert (
                db.execute(sa.text("SELECT token_hash FROM refresh_tokens")).scalar_one()
                == "existing-session-hash"
            )
            assert "partner_handoffs" not in sa.inspect(db).get_table_names()
            migration.upgrade()
    finally:
        engine.dispose()

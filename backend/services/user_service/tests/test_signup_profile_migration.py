"""Exercise the additive migration on an existing row and its reverse."""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_signup_profile_migration_preserves_existing_accounts(monkeypatch):
    path = Path(__file__).parents[1] / "alembic/versions/20260913_0004_signup_profile.py"
    spec = importlib.util.spec_from_file_location("signup_profile_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite:///:memory:")
    try:
        with engine.begin() as connection:
            connection.execute(sa.text("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, dob DATE)"))
            connection.execute(sa.text("INSERT INTO users VALUES (1, 'existing@example.com', '1995-04-12')"))
            monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
            migration.upgrade()
            row = connection.execute(sa.text("SELECT * FROM users")).mappings().one()
            assert row["email"] == "existing@example.com"
            assert row["dob"] == "1995-04-12"
            assert row["blood_type"] is None and row["primary_goal"] is None
            connection.execute(sa.text("UPDATE users SET blood_type = 'AB+', primary_goal = 'vitals'"))
            migration.downgrade()
            columns = {column["name"] for column in sa.inspect(connection).get_columns("users")}
            assert columns == {"id", "email", "dob"}
            assert connection.execute(sa.text("SELECT email FROM users")).scalar_one() == "existing@example.com"
            migration.upgrade()
            assert connection.execute(sa.text("SELECT blood_type FROM users")).scalar_one() is None
    finally:
        engine.dispose()

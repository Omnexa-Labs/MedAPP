"""Exercise the directory migration on SQLite without claiming PostgreSQL acceptance."""

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


@pytest.fixture
def migrated():
    path = (
        Path(__file__).resolve().parents[1]
        / "services/hospital_service/alembic/versions/20260915_0005_directory_drafts.py"
    )
    spec = importlib.util.spec_from_file_location("directory_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as db:
        db.execute(
            sa.text(
                "CREATE TABLE hospital_profiles (id UUID PRIMARY KEY, name TEXT NOT NULL, is_listable BOOLEAN NOT NULL)"
            )
        )
        db.execute(
            sa.text(
                "INSERT INTO hospital_profiles VALUES ('11111111111141118111111111111111', 'Existing hospital', true)"
            )
        )
        migration.op = Operations(MigrationContext.configure(db))
        migration.context = SimpleNamespace(is_offline_mode=lambda: False)
        migration.upgrade()
        yield migration, db
    engine.dispose()


def test_empty_migration_preserves_legacy_public_details_and_roundtrips(migrated):
    migration, db = migrated
    assert db.execute(
        sa.text(
            "SELECT name, is_listable, directory_draft, directory_version, directory_published_at FROM hospital_profiles"
        )
    ).one() == ("Existing hospital", 1, None, 1, None)
    migration.downgrade()
    assert "hospital_directory_events" not in sa.inspect(db).get_table_names()
    assert db.execute(sa.text("SELECT name, is_listable FROM hospital_profiles")).one() == (
        "Existing hospital",
        1,
    )
    migration.upgrade()
    assert db.scalar(sa.text("SELECT directory_version FROM hospital_profiles")) == 1


@pytest.mark.parametrize("evidence", ["draft", "version", "publication", "event", "offline"])
def test_downgrade_refuses_to_discard_directory_evidence(migrated, evidence):
    migration, db = migrated
    if evidence == "draft":
        db.execute(sa.text("UPDATE hospital_profiles SET directory_draft='{}'"))
    elif evidence == "version":
        db.execute(sa.text("UPDATE hospital_profiles SET directory_version=2"))
    elif evidence == "publication":
        db.execute(
            sa.text("UPDATE hospital_profiles SET directory_published_at='2026-09-15 12:00:00'")
        )
    elif evidence == "event":
        db.execute(
            sa.text(
                "INSERT INTO hospital_directory_events (id, hospital_id, actor_id, version, action, changed_fields, before, after) VALUES ('22222222222242228222222222222222', '11111111111141118111111111111111', '33333333333343338333333333333333', 2, 'draft.saved', '[]', '{}', '{}')"
            )
        )
    else:
        migration.context.is_offline_mode = lambda: True
    with pytest.raises(RuntimeError, match="cannot discard hospital profile drafts"):
        migration.downgrade()
    assert "hospital_directory_events" in sa.inspect(db).get_table_names()
    assert db.scalar(sa.text("SELECT count(*) FROM hospital_profiles")) == 1

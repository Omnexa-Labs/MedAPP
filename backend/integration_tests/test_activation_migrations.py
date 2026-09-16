import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[1] / "services"


@pytest.mark.parametrize(
    "service,filename,table",
    [
        (
            "user_service",
            "20260914_0009_professional_activation.py",
            "professional_activation_receipts",
        ),
        (
            "doctor_service",
            "20260914_0002_professional_activation.py",
            "professional_activation_receipts",
        ),
        (
            "nurse_service",
            "20260914_0002_professional_activation.py",
            "professional_activation_receipts",
        ),
        ("onboarding_service", "20260914_0003_activation_queue.py", "application_activations"),
    ],
)
def test_migration_roundtrip_preserves_existing_data_and_refuses_evidence_loss(
    service, filename, table
):
    spec = importlib.util.spec_from_file_location(
        "tested_activation_migration", ROOT / service / "alembic/versions" / filename
    )
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE partner_applications (id UUID PRIMARY KEY, legal_name TEXT NOT NULL)"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO partner_applications VALUES ('11111111111141118111111111111111', 'Existing application')"
            )
        )
        migration.op = Operations(MigrationContext.configure(connection))
        migration.context = SimpleNamespace(is_offline_mode=lambda: False)
        migration.upgrade()
        assert table in sa.inspect(connection).get_table_names()
        migration.downgrade()
        assert table not in sa.inspect(connection).get_table_names()
        migration.upgrade()
        assert (
            connection.scalar(sa.text("SELECT legal_name FROM partner_applications"))
            == "Existing application"
        )
        if table == "professional_activation_receipts":
            connection.execute(
                sa.text(
                    "INSERT INTO professional_activation_receipts (id, applicant_id, request_hash, role, resource_id) VALUES ('22222222222242228222222222222222', '11111111111141118111111111111111', :digest, 'doctor', '33333333333343338333333333333333')"
                ),
                {"digest": "a" * 64},
            )
        else:
            connection.execute(
                sa.text(
                    "INSERT INTO application_activations (id, application_id, approval_version, target, state, command_json, attempts, next_attempt_at) VALUES ('22222222222242228222222222222222', '11111111111141118111111111111111', 5, 'doctor', 'pending', '{}', 0, '2026-09-14 18:00:00')"
                )
            )
        with pytest.raises(RuntimeError, match="cannot discard"):
            migration.downgrade()
        assert connection.scalar(sa.text(f"SELECT count(*) FROM {table}")) == 1
    engine.dispose()

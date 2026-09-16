import importlib.util
from datetime import UTC, datetime, timedelta
from pathlib import Path
from secrets import token_hex
from unittest.mock import Mock
from uuid import uuid4

import httpx
import jwt
import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.config import settings
from app.deps import get_db
from app.main import create_app
from app.storage import GcsDocumentStorage
from shared.auth.jwt import issue_access_token
from sqlalchemy import create_engine, inspect, text


async def test_gcs_adapter_uses_private_immutable_generations():
    client = Mock()
    bucket = client.bucket.return_value
    blob = bucket.blob.return_value
    blob.generation = 123
    blob.download_as_bytes.return_value = b"file"
    storage = GcsDocumentStorage("private-credentials", client)
    assert not client.bucket.called
    assert await storage.write("onboarding/app/doc", b"file", "application/pdf") == "123"
    assert blob.cache_control == "private, no-store"
    blob.upload_from_string.assert_called_once_with(
        b"file",
        content_type="application/pdf",
        if_generation_match=0,
        checksum="crc32c",
        timeout=30,
        retry=None,
    )
    assert await storage.read("onboarding/app/doc", "123", 10) == b"file"
    bucket.blob.assert_called_with("onboarding/app/doc", generation=123)
    blob.download_as_bytes.assert_called_once_with(
        if_generation_match=123, end=10, timeout=30, checksum="crc32c", retry=None
    )


async def test_unconfigured_storage_is_lazy_and_fails_closed():
    storage = GcsDocumentStorage("")
    with pytest.raises(RuntimeError, match="not configured"):
        await storage.write("unused", b"data", "application/pdf")


async def test_storage_requires_an_acknowledged_generation():
    client = Mock()
    client.bucket.return_value.blob.return_value.generation = None
    with pytest.raises(RuntimeError, match="generation"):
        await GcsDocumentStorage("private", client).write("key", b"data", "application/pdf")


@pytest.mark.parametrize(
    "change",
    [
        {"typ": "refresh"},
        {"typ": "mfa_challenge"},
        {"aud": "other-app"},
        {"iss": "other-issuer"},
        {"exp": 1},
        {"exp": None},
        {"typ": None},
        {"sub": "not-a-uuid"},
        {"role": None},
        {"aud": None},
        {"iss": None},
    ],
)
async def test_real_auth_rejects_non_access_or_invalid_claims(sessionmaker, monkeypatch, change):
    secret = token_hex(32)
    monkeypatch.setattr(settings, "jwt_secret", secret)
    payload = {
        "sub": str(uuid4()),
        "role": "patient",
        "aud": settings.jwt_audience,
        "iss": settings.jwt_issuer,
        "typ": "access",
        "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
    }
    payload.update(change)
    payload = {key: value for key, value in payload.items() if value is not None}
    token = jwt.encode(payload, secret, algorithm=settings.jwt_algorithm)
    application = create_app()

    async def db_override():
        async with sessionmaker() as db:
            yield db

    application.dependency_overrides[get_db] = db_override
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application), base_url="http://test"
    ) as client:
        response = await client.get(
            "/v1/onboarding/applications", headers={"Authorization": "Bearer " + token}
        )
    assert response.status_code == 401, response.text


async def test_valid_patient_access_token_and_unauthenticated_upload(
    sessionmaker, monkeypatch, practitioner_payload
):
    secret = token_hex(32)
    monkeypatch.setattr(settings, "jwt_secret", secret)
    subject = str(uuid4())
    token = issue_access_token(subject=subject, role="patient", secret=secret)
    application = create_app()

    async def db_override():
        async with sessionmaker() as db:
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

    application.dependency_overrides[get_db] = db_override
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/onboarding/applications",
            json=practitioner_payload,
            headers={"Authorization": "Bearer " + token},
        )
        assert response.status_code == 201
        assert response.json()["submitted_by_user_id"] == subject
        url = f"/v1/onboarding/applications/{response.json()['application_id']}/documents/upload?kind=medical_license"
        response = await client.post(
            url, content=b"%PDF-1.7", headers={"If-Match": '"1"', "Content-Type": "application/pdf"}
        )
        assert response.status_code == 401


def migration(filename):
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / filename
    spec = importlib.util.spec_from_file_location(filename.replace(".py", ""), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_lifecycle_migration_preserves_legacy_rows_and_protects_new_evidence(monkeypatch):
    initial = migration("20260518_0001_initial_schema.py")
    lifecycle = migration("20260914_0002_application_lifecycle.py")
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
        initial.upgrade()
        connection.execute(
            text(
                "INSERT INTO partner_applications "
                "(id, created_at, updated_at, partner_type, legal_name, display_name, submitted_by_user_id, status, documents_json, team_members_json) "
                "VALUES (:id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'practitioner', 'Legacy doctor', 'Legacy doctor', :owner, 'approved', :docs, '[]')"
            ),
            {
                "id": uuid4().hex,
                "owner": uuid4().hex,
                "docs": '[{"url":"https://old.example.test/license.pdf","verified":true}]',
            },
        )
        lifecycle.upgrade()
        row = connection.execute(
            text("SELECT version, status, documents_json, attested_at FROM partner_applications")
        ).one()
        assert row.version == 1 and row.status == "approved" and row.attested_at is None
        assert "https://old.example.test/license.pdf" in row.documents_json
        columns = {c["name"]: c for c in inspect(connection).get_columns("application_events")}
        assert columns["created_at"]["default"] and columns["updated_at"]["default"]
        assert (
            inspect(connection).get_foreign_keys("application_events")[0]["referred_table"]
            == "partner_applications"
        )
        monkeypatch.setattr(lifecycle.context, "is_offline_mode", lambda: False)
        # A fresh, unused upgrade can be rolled back without deleting old rows.
        lifecycle.downgrade()
        assert connection.scalar(text("SELECT count(*) FROM partner_applications")) == 1
        lifecycle.upgrade()
        connection.execute(
            text("UPDATE partner_applications SET professional_first_name='New evidence'")
        )
        with pytest.raises(RuntimeError, match="cannot discard"):
            lifecycle.downgrade()
        assert "application_events" in inspect(connection).get_table_names()
        connection.execute(text("UPDATE partner_applications SET professional_first_name=NULL"))
        app_id = connection.scalar(text("SELECT id FROM partner_applications"))
        connection.execute(
            text(
                "INSERT INTO application_events (id, application_id, actor_id, action, application_version, details) "
                "VALUES (:id, :app, :actor, 'submitted', 2, '{}')"
            ),
            {"id": uuid4().hex, "app": app_id, "actor": uuid4().hex},
        )
        with pytest.raises(RuntimeError, match="cannot discard"):
            lifecycle.downgrade()
    engine.dispose()

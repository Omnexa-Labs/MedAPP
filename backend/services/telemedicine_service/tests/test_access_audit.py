"""PHI access audit trail — telemedicine_service (room + consultation chat).

The transcript is the most sensitive text this service holds, so the sweep test
here matters more than the counting: message BODIES must never appear in a row.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

from app.deps import get_current_principal, get_db
from app.main import create_app
from app.models import AccessAudit

# Planted in a chat message, then swept for.
MESSAGE_SENTINEL = "my CD4 count dropped again this month"


async def _audit_rows(sessionmaker):
    async with sessionmaker() as session:
        result = await session.scalars(select(AccessAudit).order_by(AccessAudit.created_at.asc()))
        return list(result.all())


async def _client_for(sessionmaker, principal):
    app = create_app()

    async def _db_override():
        async with sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_principal] = lambda: principal
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_room_read_writes_one_granted_row_naming_the_patient(
    client, sessionmaker, room_payload, principal_doctor, principal_patient
):
    created = await client.post("/v1/rooms", json=room_payload)
    assert created.status_code == 201
    room_id = created.json()["room_id"]
    # Creating a room is a write, not an audited read.
    assert await _audit_rows(sessionmaker) == []

    response = await client.get(f"/v1/rooms/{room_id}")
    assert response.status_code == 200

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == 1
    row = rows[0]
    assert row.resource == "room"
    assert str(row.resource_id) == room_id
    assert str(row.accessor_user_id) == principal_doctor.subject
    assert row.accessor_role == "doctor"
    # The subject is looked up from the room's `patient` participant, not
    # guessed from `created_by_user_id` (which is the DOCTOR here — a fallback
    # would have filed the doctor as the data subject).
    assert str(row.patient_id) == principal_patient.subject
    assert row.outcome == "granted"


@pytest.mark.asyncio
async def test_message_read_records_count_not_bodies(
    client, sessionmaker, room_payload, room_token_factory, principal_doctor, principal_patient
):
    created = await client.post("/v1/rooms", json=room_payload)
    room_id = created.json()["room_id"]
    token = room_token_factory(UUID(room_id), principal_doctor.subject, "doctor")
    await client.post(f"/v1/rooms/{room_id}/join", headers={"X-Room-Token": token})
    posted = await client.post(
        f"/v1/rooms/{room_id}/messages",
        json={"body": MESSAGE_SENTINEL},
        headers={"X-Room-Token": token},
    )
    assert posted.status_code == 200, posted.text

    before = len(await _audit_rows(sessionmaker))
    response = await client.get(f"/v1/rooms/{room_id}/messages")
    assert response.status_code == 200
    assert len(response.json()) == 1

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == before + 1
    row = rows[-1]
    assert row.resource == "room_messages"
    assert row.record_count == 1
    assert str(row.patient_id) == principal_patient.subject

    columns = [column.name for column in AccessAudit.__table__.columns]
    for row in rows:
        blob = " ".join(str(getattr(row, name)) for name in columns).lower()
        assert MESSAGE_SENTINEL.lower() not in blob, "a chat body leaked into access_audit"
        for name in columns:
            value = getattr(row, name)
            if isinstance(value, str):
                assert len(value) <= 64, f"{name} looks like free text: {value!r}"


@pytest.mark.asyncio
async def test_non_participant_read_is_denied_and_recorded(
    client, sessionmaker, room_payload, principal_service, principal_patient
):
    """An outsider trying to open someone's consultation — the single most
    interesting line this table can hold. It must survive the rollback that the
    403 triggers, and it must name the patient whose room was targeted."""
    created = await client.post("/v1/rooms", json=room_payload)
    room_id = created.json()["room_id"]

    outsider = await _client_for(sessionmaker, principal_service)
    async with outsider:
        response = await outsider.get(f"/v1/rooms/{room_id}/messages")
    assert response.status_code == 403

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == 1
    row = rows[0]
    assert row.outcome == "denied"
    assert row.resource == "room_messages"
    assert str(row.accessor_user_id) == principal_service.subject
    assert str(row.patient_id) == principal_patient.subject
    assert str(row.resource_id) == room_id


@pytest.mark.asyncio
async def test_token_issue_is_audited(client, sessionmaker, room_payload):
    """Issuing a room token is the moment access to a live consultation is
    granted, and the router's second `get_room` must NOT add a second row."""
    created = await client.post("/v1/rooms", json=room_payload)
    room_id = created.json()["room_id"]

    response = await client.get(f"/v1/rooms/{room_id}/token")
    assert response.status_code == 200

    rows = await _audit_rows(sessionmaker)
    assert [row.resource for row in rows] == ["room_token"]


@pytest.mark.asyncio
async def test_unknown_room_writes_no_row(client, sessionmaker):
    response = await client.get(f"/v1/rooms/{uuid4()}/messages")
    assert response.status_code == 404
    assert await _audit_rows(sessionmaker) == []


@pytest.mark.asyncio
async def test_audit_write_failure_fails_closed(client, sessionmaker, room_payload):
    """No audit row, no transcript."""
    created = await client.post("/v1/rooms", json=room_payload)
    room_id = created.json()["room_id"]

    async with sessionmaker() as session:
        await session.execute(text("DROP TABLE access_audit"))
        await session.commit()

    response = await client.get(f"/v1/rooms/{room_id}/messages")
    assert response.status_code == 503
    assert "audit" in response.json()["detail"].lower()

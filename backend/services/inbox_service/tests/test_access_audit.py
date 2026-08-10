"""PHI access audit trail — inbox_service (clinical message threads).

A handoff thread's first message is a clinical summary written by a service
account and its subject line routinely carries the complaint, so this suite
leans hardest on the "nothing clinical in the row" sweep.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

from app.deps import get_current_principal, get_db
from app.main import create_app
from app.models import AccessAudit

SUBJECT_SENTINEL = "Escalated: possible medication overdose"
BODY_SENTINEL = "she took four of the 500mg tablets by mistake"


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


async def _thread_with_message(client, principal_user):
    created = await client.post(
        "/v1/threads",
        json={
            "subject": SUBJECT_SENTINEL,
            "participant_user_ids": [principal_user.subject],
            "participant_roles": ["patient"],
            "assigned_role": "nurse",
            "source": "direct",
        },
    )
    assert created.status_code == 201, created.text
    thread_id = created.json()["thread_id"]
    posted = await client.post(f"/v1/threads/{thread_id}/messages", json={"body": BODY_SENTINEL})
    assert posted.status_code == 200, posted.text
    return thread_id


@pytest.mark.asyncio
async def test_message_read_writes_one_granted_row(client, sessionmaker, principal_user):
    thread_id = await _thread_with_message(client, principal_user)
    # Creating a thread and posting into it are writes, not audited reads.
    assert await _audit_rows(sessionmaker) == []

    response = await client.get(f"/v1/threads/{thread_id}/messages")
    assert response.status_code == 200
    assert len(response.json()) == 1

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == 1
    row = rows[0]
    assert row.resource == "thread_messages"
    assert str(row.resource_id) == thread_id
    assert str(row.accessor_user_id) == principal_user.subject
    assert row.accessor_role == "user"
    # Resolved from the participant carrying the patient-side role, not from
    # `created_by_user_id`.
    assert str(row.patient_id) == principal_user.subject
    assert row.outcome == "granted"
    assert row.record_count == 1
    assert row.admin_override is False


@pytest.mark.asyncio
async def test_thread_detail_read_is_audited(client, sessionmaker, principal_user):
    thread_id = await _thread_with_message(client, principal_user)
    response = await client.get(f"/v1/threads/{thread_id}")
    assert response.status_code == 200

    rows = await _audit_rows(sessionmaker)
    # Exactly one: `get_thread` is the unaudited internal helper, so the router
    # read must not produce a second row.
    assert [row.resource for row in rows] == ["thread"]


@pytest.mark.asyncio
async def test_non_participant_read_is_denied_and_recorded(
    client, sessionmaker, principal_user, principal_service
):
    thread_id = await _thread_with_message(client, principal_user)

    outsider = await _client_for(sessionmaker, principal_service)
    async with outsider:
        response = await outsider.get(f"/v1/threads/{thread_id}/messages")
    assert response.status_code == 403

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == 1
    row = rows[0]
    assert row.outcome == "denied"
    assert row.resource == "thread_messages"
    assert str(row.accessor_user_id) == principal_service.subject
    # The denial names whose thread was targeted.
    assert str(row.patient_id) == principal_user.subject


@pytest.mark.asyncio
async def test_no_clinical_content_in_any_audit_row(
    client, service_client, sessionmaker, principal_user, principal_service
):
    thread_id = await _thread_with_message(client, principal_user)
    await client.get(f"/v1/threads/{thread_id}")
    await client.get(f"/v1/threads/{thread_id}/messages")

    handoff = await service_client.post(
        "/v1/threads/handoff",
        json={
            "user_id": principal_user.subject,
            "assigned_role": "doctor",
            "subject": SUBJECT_SENTINEL,
            "summary": BODY_SENTINEL,
            "booking_id": None,
            "locale": "en",
        },
    )
    assert handoff.status_code == 201, handoff.text
    await client.get(f"/v1/threads/{handoff.json()['thread_id']}/messages")

    outsider = await _client_for(sessionmaker, principal_service)
    async with outsider:
        await outsider.get(f"/v1/threads/{thread_id}/messages")  # 403

    rows = await _audit_rows(sessionmaker)
    assert rows, "the sweep proves nothing if nothing was recorded"
    columns = [column.name for column in AccessAudit.__table__.columns]
    for row in rows:
        blob = " ".join(str(getattr(row, name)) for name in columns).lower()
        for sentinel in (SUBJECT_SENTINEL, BODY_SENTINEL):
            assert sentinel.lower() not in blob, f"{sentinel!r} leaked into access_audit"
        for name in columns:
            value = getattr(row, name)
            if isinstance(value, str):
                assert len(value) <= 64, f"{name} looks like free text: {value!r}"


@pytest.mark.asyncio
async def test_unknown_thread_writes_no_row(client, sessionmaker):
    response = await client.get(f"/v1/threads/{uuid4()}/messages")
    assert response.status_code == 404
    assert await _audit_rows(sessionmaker) == []


@pytest.mark.asyncio
async def test_audit_write_failure_fails_closed(client, sessionmaker, principal_user):
    thread_id = await _thread_with_message(client, principal_user)

    async with sessionmaker() as session:
        await session.execute(text("DROP TABLE access_audit"))
        await session.commit()

    response = await client.get(f"/v1/threads/{thread_id}/messages")
    assert response.status_code == 503
    assert "audit" in response.json()["detail"].lower()
    assert BODY_SENTINEL not in response.text

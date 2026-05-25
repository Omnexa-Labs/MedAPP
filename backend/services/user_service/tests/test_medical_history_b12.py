"""Audit finding B-12 regression: medical_history must be a typed schema.

Before B-12 the column accepted any JSON shape — clients could write
arbitrary keys (PII bleed), oversized notes blobs (multi-MB rows),
or values that the audit log couldn't selectively redact. The fix
defines a Pydantic ``MedicalHistory`` model with ``extra="forbid"``
recursively, and an ORM ``@validates`` hook so service-layer writes
are gated by the same schema.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import User

pytestmark = pytest.mark.asyncio


async def _bearer(client) -> str:
    await client.post(
        "/auth/signup",
        json={
            "email": "medical@example.com",
            "password": "password123",
            "first_name": "Med",
            "last_name": "Hist",
        },
    )
    r = await client.post(
        "/auth/login",
        json={"email": "medical@example.com", "password": "password123"},
    )
    return r.json()["access_token"]


# ── Route-level: valid input round-trips ────────────────────────────────────


async def test_valid_medical_history_round_trips(client):
    token = await _bearer(client)
    payload = {
        "medical_history": {
            "conditions": [
                {"name": "Asthma", "status": "active", "notes": "mild"}
            ],
            "medications": [
                {"name": "Salbutamol", "dosage": "100mcg", "frequency": "PRN"}
            ],
            "surgeries": [],
            "family_history": [
                {"relation": "mother", "condition": "Hypertension"}
            ],
            "notes": "Reviewed 2026-05-23.",
        }
    }
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json=payload,
    )
    assert r.status_code == 200, r.text
    mh = r.json()["medical_history"]
    assert mh["conditions"][0]["name"] == "Asthma"
    assert mh["medications"][0]["dosage"] == "100mcg"
    assert mh["family_history"][0]["relation"] == "mother"

    me = await client.get("/me", headers={"authorization": f"Bearer {token}"})
    assert me.json()["medical_history"]["notes"] == "Reviewed 2026-05-23."


# ── Route-level: unknown keys rejected ──────────────────────────────────────


async def test_unknown_top_level_key_rejected(client):
    """A key outside the MedicalHistory schema (e.g. an attempt to stash
    a credit card number) must 422 rather than land in JSONB."""
    token = await _bearer(client)
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json={"medical_history": {"credit_card": "4111111111111111"}},
    )
    assert r.status_code == 422, r.text


async def test_unknown_nested_key_rejected(client):
    """Same protection one level down — adding an undeclared field to a
    condition must 422."""
    token = await _bearer(client)
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json={
            "medical_history": {
                "conditions": [
                    {"name": "Asthma", "ssn": "123-45-6789"}
                ]
            }
        },
    )
    assert r.status_code == 422


async def test_invalid_status_literal_rejected(client):
    token = await _bearer(client)
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json={
            "medical_history": {
                "conditions": [{"name": "Asthma", "status": "mostly-active"}]
            }
        },
    )
    assert r.status_code == 422


async def test_invalid_family_relation_rejected(client):
    token = await _bearer(client)
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json={
            "medical_history": {
                "family_history": [
                    {"relation": "third-cousin", "condition": "Foo"}
                ]
            }
        },
    )
    assert r.status_code == 422


# ── Route-level: size bounds ────────────────────────────────────────────────


async def test_oversized_notes_rejected(client):
    token = await _bearer(client)
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json={"medical_history": {"notes": "x" * 2001}},
    )
    assert r.status_code == 422


async def test_too_many_conditions_rejected(client):
    token = await _bearer(client)
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json={
            "medical_history": {
                "conditions": [
                    {"name": f"Condition {i}"} for i in range(51)
                ]
            }
        },
    )
    assert r.status_code == 422


# ── Allergies bounds ────────────────────────────────────────────────────────


async def test_too_many_allergies_rejected(client):
    token = await _bearer(client)
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json={"allergies": [f"item-{i}" for i in range(51)]},
    )
    assert r.status_code == 422


async def test_oversized_allergy_string_rejected(client):
    token = await _bearer(client)
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json={"allergies": ["x" * 121]},
    )
    assert r.status_code == 422


# ── Defense in depth: ORM @validates blocks service-layer writes ────────────


async def test_orm_validates_rejects_unknown_key(db, session_factory):
    """Anything that bypasses the API and writes directly through the ORM
    is still gated by the @validates hook — same Pydantic schema, same
    refusal."""
    async with session_factory() as session:
        user = User(
            email="orm@example.com",
            password_hash="x",
            first_name="O",
            last_name="R",
        )
        session.add(user)
        await session.flush()
        with pytest.raises(Exception) as exc:
            user.medical_history = {"unexpected_field": "anything"}
        # Pydantic raises ValidationError, surfaced through validates.
        assert "unexpected" in str(exc.value).lower() or "extra" in str(exc.value).lower()


async def test_orm_validates_rejects_bad_allergies(db, session_factory):
    async with session_factory() as session:
        user = User(
            email="allergy@example.com",
            password_hash="x",
            first_name="A",
            last_name="L",
        )
        session.add(user)
        await session.flush()
        with pytest.raises(ValueError):
            user.allergies = ["x" * 121]
        with pytest.raises(ValueError):
            user.allergies = [f"item-{i}" for i in range(51)]
        with pytest.raises(ValueError):
            user.allergies = "not-a-list"


async def test_orm_validates_normalises_empty(db, session_factory):
    """Empty / None inputs collapse to the documented empty shape rather
    than letting nulls reach the DB."""
    async with session_factory() as session:
        user = User(
            email="empty@example.com",
            password_hash="x",
            first_name="E",
            last_name="M",
            medical_history=None,
            allergies=None,
        )
        session.add(user)
        await session.flush()
        assert user.medical_history == {}
        assert user.allergies == []

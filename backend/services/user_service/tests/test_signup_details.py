"""Signup details must persist atomically and remain scoped to the account."""
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import select

from app.models import User

pytestmark = pytest.mark.asyncio

ACCOUNT = {
    "email": "details@example.com",
    "password": "LocalDetails123!",
    "first_name": "Ama",
    "last_name": "Mensah",
}
DETAILS = {
    "dob": "1995-04-12",
    "gender": "female",
    "blood_type": "AB+",
    "primary_goal": "vitals",
}


async def login(client, email=ACCOUNT["email"]):
    response = await client.post("/auth/login", json={"email": email, "password": ACCOUNT["password"]})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_signup_details_survive_a_new_login_and_database_session(client, session_factory):
    response = await client.post("/auth/signup", json={**ACCOUNT, **DETAILS})
    assert response.status_code == 201
    for key, value in DETAILS.items():
        assert response.json()[key] == value
    profile = await client.get("/me", headers=await login(client))
    assert profile.status_code == 200
    for key, value in DETAILS.items():
        assert profile.json()[key] == value
    async with session_factory() as session:
        user = await session.scalar(select(User).where(User.email == ACCOUNT["email"]))
        assert user.dob == date(1995, 4, 12)
        assert user.gender == "female"
        assert user.blood_type == "AB+"
        assert user.primary_goal == "vitals"
        assert user.consents == {}


async def test_legacy_signup_leaves_unprovided_details_empty(client):
    response = await client.post("/auth/signup", json=ACCOUNT)
    assert response.status_code == 201
    for key in DETAILS:
        assert response.json()[key] is None


@pytest.mark.parametrize("field,value", [
    ("dob", "2999-01-01"),
    ("dob", "2024-02-30"),
    ("dob", datetime.now(timezone.utc).date().isoformat()),
    ("gender", "unsupported"),
    ("blood_type", "C+"),
    ("primary_goal", "unbounded-goal"),
])
async def test_invalid_details_reject_signup_before_creating_an_account(client, session_factory, field, value):
    response = await client.post("/auth/signup", json={**ACCOUNT, **DETAILS, field: value})
    assert response.status_code == 422
    async with session_factory() as session:
        assert await session.scalar(select(User).where(User.email == ACCOUNT["email"])) is None


async def test_profile_patch_changes_only_supplied_details_for_current_account(client):
    assert (await client.post("/auth/signup", json={**ACCOUNT, **DETAILS})).status_code == 201
    other = "other-details@example.com"
    assert (await client.post("/auth/signup", json={**ACCOUNT, "email": other})).status_code == 201
    headers = await login(client)
    response = await client.patch("/me", headers=headers, json={"blood_type": None, "primary_goal": "meds"})
    assert response.status_code == 200
    restored = (await client.get("/me", headers=await login(client))).json()
    assert restored["blood_type"] is None
    assert restored["primary_goal"] == "meds"
    assert restored["dob"] == DETAILS["dob"]
    assert restored["gender"] == DETAILS["gender"]
    other_profile = (await client.get("/me", headers=await login(client, other))).json()
    assert other_profile["primary_goal"] is None


async def test_invalid_profile_patch_is_atomic(client):
    assert (await client.post("/auth/signup", json={**ACCOUNT, **DETAILS})).status_code == 201
    headers = await login(client)
    response = await client.patch("/me", headers=headers, json={"blood_type": "O-", "primary_goal": "invalid"})
    assert response.status_code == 422
    profile = (await client.get("/me", headers=headers)).json()
    assert profile["blood_type"] == DETAILS["blood_type"]
    assert profile["primary_goal"] == DETAILS["primary_goal"]

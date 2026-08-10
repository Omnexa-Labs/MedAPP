import pytest

pytestmark = pytest.mark.asyncio


# Signs up a PLAIN USER. Public signup cannot grant a clinician role any more
# (schemas/auth.py), and it never should have: KYC approval is what sets
# `User.role`, via `review_submission`. These tests exercise that path, so the
# account they start from is exactly what a real applicant has - a `user` asking
# to become something else.
async def _signup_login(client, email="doc@b.com", role="user"):
    await client.post(
        "/auth/signup",
        json={
            "email": email,
            "password": "password123",
            "first_name": "T",
            "last_name": "U",
            "role": role,
        },
    )
    r = await client.post("/auth/login", json={"email": email, "password": "password123"})
    return r.json()["access_token"]


async def test_doctor_can_submit_kyc(client):
    token = await _signup_login(client)
    r = await client.post(
        "/me/kyc",
        headers={"authorization": f"Bearer {token}"},
        json={
            "target_role": "doctor",
            "documents": [{"kind": "license", "url": "https://gcs/doc1.pdf"}],
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "submitted"
    assert body["submitted_role"] == "doctor"


async def test_user_cannot_submit_for_user_role(client):
    await client.post(
        "/auth/signup",
        json={
            "email": "u@b.com",
            "password": "password123",
            "first_name": "T",
            "last_name": "U",
            "role": "user",
        },
    )
    r = await client.post("/auth/login", json={"email": "u@b.com", "password": "password123"})
    token = r.json()["access_token"]
    r = await client.post(
        "/me/kyc",
        headers={"authorization": f"Bearer {token}"},
        json={
            "target_role": "user",
            "documents": [{"kind": "license", "url": "x"}],
        },
    )
    assert r.status_code == 400


async def test_non_admin_cannot_list_pending_kyc(client):
    token = await _signup_login(client)
    r = await client.get("/admin/kyc/pending", headers={"authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_user_cannot_review_own_kyc_submission(client):
    token = await _signup_login(client, email="adminlike@b.com", role="hospital_admin")
    submit = await client.post(
        "/me/kyc",
        headers={"authorization": f"Bearer {token}"},
        json={
            "target_role": "hospital_admin",
            "documents": [{"kind": "certification", "url": "https://gcs/doc2.pdf"}],
        },
    )
    assert submit.status_code == 201, submit.text

    review = await client.post(
        f"/admin/kyc/{submit.json()['id']}/review",
        headers={"authorization": f"Bearer {token}"},
        json={"approve": True},
    )
    assert review.status_code == 400

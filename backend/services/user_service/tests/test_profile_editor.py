import pytest

from test_profile import _bearer

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("field,value", [
    ("first_name", None), ("last_name", None), ("first_name", ""),
    ("first_name", "   "), ("first_name", "a" * 256), ("last_name", "b" * 256),
])
async def test_invalid_name_rejects_entire_profile_edit(client, field, value):
    token = await _bearer(client)
    headers = {"authorization": f"Bearer {token}"}
    response = await client.patch("/me", headers=headers,
                                  json={field: value, "primary_goal": "wellness"})
    assert response.status_code == 422, response.text
    profile = (await client.get("/me", headers=headers)).json()
    assert profile["first_name"] == "T"
    assert profile["last_name"] == "U"
    assert profile["primary_goal"] is None


async def test_editor_saves_normalized_name_and_nullable_details_after_new_login(client):
    token = await _bearer(client)
    headers = {"authorization": f"Bearer {token}"}
    response = await client.patch("/me", headers=headers, json={
        "first_name": "  Ama  Kofi  ", "last_name": "  de Silva  ",
        "dob": "1994-06-15", "gender": "nonbinary", "blood_type": "AB-", "primary_goal": "tele",
    })
    assert response.status_code == 200, response.text
    assert response.json()["first_name"] == "Ama  Kofi"
    assert response.json()["last_name"] == "de Silva"
    # Optional details can be removed; an omitted name or goal must be retained.
    response = await client.patch("/me", headers=headers,
        json={"last_name": "", "dob": None, "blood_type": None, "gender": None})
    assert response.status_code == 200, response.text
    login = await client.post("/auth/login", json={"email": "a@b.com", "password": "password123"})
    profile = (await client.get("/me", headers={"authorization": f"Bearer {login.json()['access_token']}"})).json()
    assert profile["first_name"] == "Ama  Kofi"
    assert profile["last_name"] == ""
    assert profile["dob"] is None
    assert profile["blood_type"] is None
    assert profile["gender"] is None
    assert profile["primary_goal"] == "tele"


async def test_name_aliases_use_same_validation_and_leave_contact_unchanged(client):
    token = await _bearer(client)
    headers = {"authorization": f"Bearer {token}"}
    response = await client.patch("/me", headers=headers, json={"firstName": "  Ama ", "surname": " Mensah "})
    assert response.status_code == 200
    assert response.json()["first_name"] == "Ama"
    assert response.json()["last_name"] == "Mensah"
    assert response.json()["email"] == "a@b.com"
    assert (await client.patch("/me", headers=headers, json={"firstname": " "})).status_code == 422

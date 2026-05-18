from __future__ import annotations


async def test_doctor_directory_defaults_to_empty(client) -> None:
    resp = await client.get("/v1/doctors")

    assert resp.status_code == 200
    assert resp.json() == {"items": []}
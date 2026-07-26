from __future__ import annotations


async def test_doctor_directory_defaults_to_empty(client) -> None:
    resp = await client.get("/v1/doctors")

    assert resp.status_code == 200
    assert resp.json() == {"items": []}


async def test_doctor_directory_search_by_q(client) -> None:
    # Seed two distinguishable doctors via the same authenticated client;
    # the create endpoint enforces one profile per principal, so we use
    # the second principal override below to add the second row.
    from app.deps import get_db
    from app.main import app as doctor_app
    from app.models import DoctorProfile
    from shared.auth import Principal, get_current_principal
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from uuid import UUID

    # Insert directly through the override session — bypasses the
    # one-profile-per-user check so we can seed both rows quickly.
    db_dep = doctor_app.dependency_overrides[get_db]
    async for session in db_dep():
        session.add_all(
            [
                DoctorProfile(
                    user_id=UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                    first_name="Asha",
                    last_name="Cardio",
                    specialty="cardiology",
                    bio="Heart specialist",
                    languages=[],
                    consultation_fee_cents=0,
                    is_listable=True,
                ),
                DoctorProfile(
                    user_id=UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                    first_name="Ben",
                    last_name="Pedi",
                    specialty="pediatrics",
                    bio="Children's care",
                    languages=[],
                    consultation_fee_cents=0,
                    is_listable=True,
                ),
            ]
        )
        await session.commit()
        break

    by_specialty = await client.get("/v1/doctors", params={"q": "cardio"})
    assert by_specialty.status_code == 200
    items = by_specialty.json()["items"]
    assert len(items) == 1
    assert items[0]["last_name"] == "Cardio"

    by_name = await client.get("/v1/doctors", params={"q": "ben"})
    assert by_name.status_code == 200
    assert len(by_name.json()["items"]) == 1
    assert by_name.json()["items"][0]["first_name"] == "Ben"

    none = await client.get("/v1/doctors", params={"q": "zzz-no-match"})
    assert none.status_code == 200
    assert none.json()["items"] == []
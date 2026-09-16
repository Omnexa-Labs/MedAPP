from datetime import datetime
import pytest


async def seed(client, zone="America/New_York", start="01:00", end="04:00", weekday=6):
    response = await client.post("/v1/doctors", json={"first_name": "Test", "last_name": "Clinician", "specialty": "General"})
    assert response.status_code == 201, response.text
    doctor = response.json()["doctor_id"]
    result = await client.put(f"/v1/doctors/{doctor}/availability", json={"items": [
        {"day_of_week": weekday, "start_time": start, "end_time": end, "timezone": zone}]})
    assert result.status_code == 200, result.text
    return doctor


@pytest.mark.parametrize("day,count,first,last", [
    ("2027-03-14", 4, "2027-03-14T06:00:00+00:00", "2027-03-14T08:00:00+00:00"),
    ("2026-11-01", 8, "2026-11-01T05:00:00+00:00", "2026-11-01T09:00:00+00:00"),
])
async def test_dst_uses_real_elapsed_instants(client, day, count, first, last):
    doctor = await seed(client)
    response = await client.get(f"/v1/doctors/{doctor}/slots", params={"from_date": day, "to_date": day})
    slots = response.json()["items"]
    assert len(slots) == count
    assert datetime.fromisoformat(slots[0]["starts_at"]) == datetime.fromisoformat(first)
    assert datetime.fromisoformat(slots[-1]["ends_at"]) == datetime.fromisoformat(last)
    assert len({s["starts_at"] for s in slots}) == count
    for slot in slots:
        assert (datetime.fromisoformat(slot["ends_at"]) - datetime.fromisoformat(slot["starts_at"])).total_seconds() == 1800


async def test_half_hour_zone_and_weekday_anchor(client):
    doctor = await seed(client, "Asia/Kolkata", "09:00", "10:00", 0)
    slots = (await client.get(f"/v1/doctors/{doctor}/slots", params={"from_date": "2026-09-14", "to_date": "2026-09-14"})).json()["items"]
    assert datetime.fromisoformat(slots[0]["starts_at"]).hour == 3
    assert datetime.fromisoformat(slots[0]["starts_at"]).minute == 30


@pytest.mark.parametrize("minutes", [0, -1, 241])
async def test_invalid_slot_step_is_rejected(client, minutes):
    doctor = await seed(client)
    response = await client.get(f"/v1/doctors/{doctor}/slots", params={"from_date": "2026-11-01", "to_date": "2026-11-01", "slot_minutes": minutes})
    assert response.status_code == 400


async def test_invalid_zone_rejected_and_previous_rules_preserved(client):
    doctor = await seed(client)
    result = await client.put(f"/v1/doctors/{doctor}/availability", json={"items": [{"day_of_week": 6, "start_time": "09:00", "end_time": "10:00", "timezone": "No/Such_Zone"}]})
    assert result.status_code == 422
    rules = (await client.get(f"/v1/doctors/{doctor}/availability")).json()["items"]
    assert rules[0]["timezone"] == "America/New_York"


async def test_nonexistent_boundary_returns_no_slots(client):
    doctor = await seed(client, start="02:15", end="04:00")
    response = await client.get(f"/v1/doctors/{doctor}/slots", params={"from_date": "2027-03-14", "to_date": "2027-03-14"})
    assert response.json()["items"] == []

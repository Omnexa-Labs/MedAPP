"""Dev seed for the booking slice — runs INSIDE the user_service container.

Invoked by `scripts/seed.sh`, which pipes this file into
`docker compose exec -T user_service python -`. Running in-container is
deliberate:

  * user_service is seeded through its own service layer
    (`app.services.auth_service`), against its own database — no
    hand-written INSERTs, no reaching into another service's tables.
  * doctor_service is seeded over HTTP against its own public API
    (`http://doctor_service:8002/v1/doctors`) on the compose network, so
    the doctor/user boundary is respected exactly the way the running
    app crosses it.
  * nothing depends on host-published ports, host Python, jq, or curl,
    and hitting the services directly skips the gateway's 10-req/min
    auth rate limiter that a scripted seed would otherwise trip.

booking_service is intentionally NOT seeded. The point of the slice is
to create a booking through the app.

Everything here is idempotent: users are matched by email and doctor
profiles by their owning user_id, so a second run updates rather than
duplicates. Passwords are re-hashed to the documented value on every run
so the credentials this script prints are always true.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

from sqlalchemy import select

from shared.auth.jwt import issue_access_token

from app.config import settings
from app.db import SessionLocal
from app.models import User
from app.schemas import SignupRequest
from app.services import auth_service

DOCTOR_SERVICE_URL = os.getenv("SEED_DOCTOR_SERVICE_URL", "http://doctor_service:8002")

PATIENT_PASSWORD = "MedApp!2026"
DOCTOR_PASSWORD = "MedApp!2026"

PATIENT = {
    "email": "ama.mensah@medapp.dev",
    "password": PATIENT_PASSWORD,
    "first_name": "Ama",
    "last_name": "Mensah",
    "phone": "+233241000001",
    "role": "user",
}

# Weekday 09:00-17:00, Monday(0) through Friday(4). Gives
# GET /v1/doctors/{id}/slots something real to compute against, which is
# what the Select-Time-Slot screen needs.
WEEKDAY_AVAILABILITY = [
    {"day_of_week": dow, "start_time": "09:00:00", "end_time": "17:00:00", "timezone": "UTC"}
    for dow in range(5)
]

DOCTORS: list[dict[str, Any]] = [
    {
        "email": "kwabena.osei@medapp.dev",
        "phone": "+233241000101",
        "first_name": "Kwabena",
        "last_name": "Osei",
        "specialty": "General Practice",
        "bio": (
            "Family physician with 12 years in primary care across Accra and Kumasi. "
            "Handles routine check-ups, chronic disease reviews and first-line referrals."
        ),
        "languages": ["English", "Twi"],
        "consultation_fee_cents": 12000,
        "photo_url": "https://images.medapp.dev/doctors/kwabena-osei.jpg",
    },
    {
        "email": "adjoa.boateng@medapp.dev",
        "phone": "+233241000102",
        "first_name": "Adjoa",
        "last_name": "Boateng",
        "specialty": "Cardiology",
        "bio": (
            "Consultant cardiologist focused on hypertension management and heart-failure "
            "follow-up. Trained at Korle Bu; runs a weekly remote review clinic."
        ),
        "languages": ["English", "Twi", "Ga"],
        "consultation_fee_cents": 35000,
        "photo_url": "https://images.medapp.dev/doctors/adjoa-boateng.jpg",
    },
    {
        "email": "yaw.darko@medapp.dev",
        "phone": "+233241000103",
        "first_name": "Yaw",
        "last_name": "Darko",
        "specialty": "Dermatology",
        "bio": (
            "Dermatologist treating eczema, acne and pigmentation disorders, with a "
            "particular interest in skin conditions in darker skin tones."
        ),
        "languages": ["English", "Twi"],
        "consultation_fee_cents": 25000,
        "photo_url": "https://images.medapp.dev/doctors/yaw-darko.jpg",
    },
    {
        "email": "efua.asante@medapp.dev",
        "phone": "+233241000104",
        "first_name": "Efua",
        "last_name": "Asante",
        "specialty": "Paediatrics",
        "bio": (
            "Paediatrician covering newborn checks through adolescent care, immunisation "
            "schedules and childhood asthma."
        ),
        "languages": ["English", "Fante"],
        "consultation_fee_cents": 18000,
        "photo_url": "https://images.medapp.dev/doctors/efua-asante.jpg",
    },
    {
        "email": "nii.tetteh@medapp.dev",
        "phone": "+233241000105",
        "first_name": "Nii",
        "last_name": "Tetteh",
        "specialty": "Mental Health",
        "bio": (
            "Psychiatrist offering assessment and ongoing support for anxiety, depression "
            "and sleep disorders. Consultations run 45 minutes."
        ),
        "languages": ["English", "Ga"],
        "consultation_fee_cents": 28000,
        "photo_url": "https://images.medapp.dev/doctors/nii-tetteh.jpg",
    },
    # Added for the mobile app's Provider Profile screen
    # (PractitionerSocialProfileScreen), which is a nutrition practice end to
    # end — bio, services and reviews all talk about nutrition plans and gut
    # health. That screen previously invented "Dr. Sarah Jenkins", a name a
    # tester never sees in Find Care. The rule is the other way round: a screen
    # that needs a clinician the seed lacks gets the clinician ADDED here, so
    # Find Care and the mock screens keep agreeing.
    {
        "email": "abena.owusu@medapp.dev",
        "phone": "+233241000106",
        "first_name": "Abena",
        "last_name": "Owusu",
        "specialty": "Nutrition & Dietetics",
        "bio": (
            "Clinical nutritionist working on weight management, diabetes and gut health. "
            "Builds eating plans around Ghanaian staples rather than imported substitutes."
        ),
        "languages": ["English", "Twi"],
        "consultation_fee_cents": 15000,
        "photo_url": "https://images.medapp.dev/doctors/abena-owusu.jpg",
    },
]


# ---------------------------------------------------------------- http --


def _request(method: str, path: str, *, token: str | None = None, body: Any = None) -> Any:
    url = f"{DOCTOR_SERVICE_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = resp.read()
            return json.loads(payload) if payload else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise RuntimeError(f"{method} {path} -> {exc.code}: {detail}") from exc


def _wait_until_readable(path: str, token: str, attempts: int = 10) -> None:
    """Poll a just-created resource until it can be read back.

    doctor_service's `get_db` dependency commits in its `yield` teardown,
    and FastAPI runs that teardown AFTER the response has been sent — so
    `POST /v1/doctors` hands back a 201 with a doctor_id whose row is not
    committed yet. Following up immediately with
    `PUT /v1/doctors/{id}/availability` loses that race intermittently
    and 400s with "doctor profile not found". Reading the id back first
    is the client-side workaround; the durable fix belongs in
    doctor_service (commit before responding).
    """
    import time

    for attempt in range(1, attempts + 1):
        try:
            _request("GET", path, token=token)
            return
        except RuntimeError:
            if attempt == attempts:
                raise
            time.sleep(0.5)


def _wait_for_doctor_service(attempts: int = 30) -> None:
    for attempt in range(1, attempts + 1):
        try:
            _request("GET", "/healthz")
            return
        except Exception:  # noqa: BLE001 - any failure means "not ready yet"
            if attempt == attempts:
                raise
            import time

            time.sleep(2)


# ------------------------------------------------------------- users ----


async def _ensure_user(db, spec: dict[str, Any], *, role: str) -> User:
    """Create or refresh a user through user_service's own service layer."""
    existing = await db.scalar(select(User).where(User.email == spec["email"]))
    if existing is None:
        payload = SignupRequest(
            email=spec["email"],
            password=spec["password"],
            first_name=spec["first_name"],
            last_name=spec["last_name"],
            phone=spec.get("phone"),
            role=role,
        )
        user = await auth_service.signup(db, payload)
        action = "created"
    else:
        user = existing
        # Re-assert the seeded shape so the printed credentials stay true
        # even if a previous run or manual poking drifted the row. The
        # reset-token round-trip is the service's own public way to set a
        # password without knowing the current one — cheaper than
        # reaching for the private hasher, and it revokes stale refresh
        # tokens as a side effect, which is what we want for a re-seed.
        issued = await auth_service.request_password_reset(db, spec["email"])
        if issued is not None:
            await auth_service.reset_password(db, issued[1], spec["password"])
        user.first_name = spec["first_name"]
        user.last_name = spec["last_name"]
        user.role = role
        action = "updated"

    # The signup API can only mark a contact verified when it is handed a
    # signup-verify OTP token. A seed has no inbox to read a code from, so
    # we set the flags directly on the model we just built — same layer,
    # same transaction. Without this the app's OTP gate blocks a scripted
    # login.
    user.email_verified = True
    user.phone_verified = bool(spec.get("phone"))
    user.is_active = True
    if role != "user":
        # Providers would otherwise sit in `pending` forever; there is no
        # KYC reviewer in a dev stack.
        user.kyc_status = "approved"

    await db.flush()
    print(f"  [{action}] {role:<6} {spec['email']}  ({user.id})")
    return user


# ----------------------------------------------------------- doctors ----


def _profile_payload(spec: dict[str, Any]) -> dict[str, Any]:
    return {
        "first_name": spec["first_name"],
        "last_name": spec["last_name"],
        "specialty": spec["specialty"],
        "bio": spec["bio"],
        "languages": spec["languages"],
        "consultation_fee_cents": spec["consultation_fee_cents"],
        "photo_url": spec["photo_url"],
        "is_listable": True,
    }


def _ensure_doctor_profile(spec: dict[str, Any], user_id: str, token: str) -> dict[str, Any]:
    # `only_listable=false` so a profile that was previously seeded and
    # later unlisted is still found and repaired instead of duplicated.
    existing = _request("GET", "/v1/doctors?only_listable=false", token=token)
    match = next(
        (item for item in existing.get("items", []) if item["user_id"] == user_id),
        None,
    )
    payload = _profile_payload(spec)
    if match is None:
        profile = _request("POST", "/v1/doctors", token=token, body=payload)
        action = "created"
    else:
        profile = _request(
            "PATCH", f"/v1/doctors/{match['doctor_id']}", token=token, body=payload
        )
        action = "updated"

    _wait_until_readable(f"/v1/doctors/{profile['doctor_id']}", token)
    _request(
        "PUT",
        f"/v1/doctors/{profile['doctor_id']}/availability",
        token=token,
        body={"items": WEEKDAY_AVAILABILITY},
    )
    print(
        f"  [{action}] doctor {spec['first_name']} {spec['last_name']}"
        f" — {spec['specialty']}  ({profile['doctor_id']})"
    )
    return profile


# -------------------------------------------------------------- main ----


async def main() -> int:
    if not settings.jwt_secret:
        print("USER_JWT_SECRET is empty — cannot mint the tokens the seed needs.", file=sys.stderr)
        return 1

    print("Waiting for doctor_service ...")
    _wait_for_doctor_service()

    print("\nSeeding user_service (own service layer):")
    doctor_users: list[tuple[dict[str, Any], str]] = []
    async with SessionLocal() as db:
        patient = await _ensure_user(db, PATIENT, role="user")
        patient_id = str(patient.id)
        for spec in DOCTORS:
            user = await _ensure_user(
                db, {**spec, "password": DOCTOR_PASSWORD}, role="doctor"
            )
            doctor_users.append((spec, str(user.id)))
        await db.commit()

    print("\nSeeding doctor_service (its own HTTP API):")
    profiles = []
    for spec, user_id in doctor_users:
        # Each doctor acts as itself; the profile endpoint binds the new
        # row to the token's subject, which is why we mint per-doctor.
        token = issue_access_token(
            subject=user_id,
            role="doctor",
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            ttl_minutes=10,
        )
        profiles.append((spec, _ensure_doctor_profile(spec, user_id, token)))

    print("\nSkipping booking_service on purpose — bookings are created through the app.")

    bar = "=" * 72
    print(f"\n{bar}\nSEEDED CREDENTIALS\n{bar}")
    print("\nPatient (sign in as this in the app):")
    print(f"  email     {PATIENT['email']}")
    print(f"  password  {PATIENT_PASSWORD}")
    print(f"  user_id   {patient_id}")
    print("\nDoctors (same password; log in as one to manage its profile):")
    for spec, profile in profiles:
        name = f"{spec['first_name']} {spec['last_name']}"
        print(
            f"  {profile['doctor_id']}  {name:<16} {spec['specialty']:<17}"
            f" {spec['email']}"
        )
    print(f"\n  doctor password  {DOCTOR_PASSWORD}")
    print(
        "\nUse a doctor_id above as `doctor_id` in POST /v1/bookings."
        f"\n{bar}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

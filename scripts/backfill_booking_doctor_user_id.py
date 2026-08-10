"""Backfill `bookings.doctor_user_id` for rows written before revision 20260805_0003.

WHY THIS IS A SCRIPT AND NOT PART OF THE MIGRATION
--------------------------------------------------
The value is not derivable inside booking_service's database. `doctor_id` is a
doctor_service profile id, and only doctor_service knows which user_service user
owns it. A migration that made HTTP calls would be a migration that can hang,
partially apply, and fail differently per environment, so the schema change
(`20260805_0003_booking_doctor_user_id.py`) and the data repair are separate
steps. Run this immediately after that migration.

Until a row is repaired it has `doctor_user_id = NULL`, and NULL DENIES: the
booking is invisible in `GET /v1/bookings/schedule`. That is fail-closed but it
is also a clinician not seeing an appointment they have, so this is not
optional cleanup — it is the second half of the change.

SAFETY PROPERTIES
-----------------
* Idempotent: only rows with `doctor_user_id IS NULL` are touched, so re-running
  after a partial success resumes rather than rewrites.
* Never overwrites a resolved value. If a profile is later reassigned to a
  different user, that is a data-migration decision for a human, not something a
  backfill should silently do — an authorization key that a script can flip is
  an authorization key an accident can flip.
* One HTTP call per DISTINCT doctor_id, not per booking.
* An unresolvable profile (deleted, doctor_service down) leaves the row NULL and
  is reported in the exit summary. A non-zero unresolved count is the signal to
  run again later; the script exits 1 so a deploy pipeline notices.

Run it the way seed_dev_data.py is run — inside the service container, so the
compose network hostnames and the service's own settings apply:

    docker compose exec -T booking_service python - < scripts/backfill_booking_doctor_user_id.py

Env overrides: `BACKFILL_DOCTOR_SERVICE_URL` (defaults to booking_service's own
`settings.doctor_service_url`), `BACKFILL_DRY_RUN=1` to report without writing.

No patient identifier is printed. The output names doctor profile ids and
counts only — profile ids are already public in doctor_service's directory, and
a log of "which patients have appointments" is precisely what must not end up in
a deploy log.
"""

from __future__ import annotations

import asyncio
import os
import sys
from uuid import UUID

import httpx
from sqlalchemy import func, select, update

sys.path.insert(0, "/app")

from app.config import settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import Booking  # noqa: E402

DOCTOR_SERVICE_URL = os.getenv("BACKFILL_DOCTOR_SERVICE_URL", settings.doctor_service_url)
DRY_RUN = os.getenv("BACKFILL_DRY_RUN", "") not in {"", "0", "false", "False"}
TIMEOUT = 10.0


async def _resolve(client: httpx.AsyncClient, doctor_id: UUID) -> UUID | None:
    """Ask doctor_service which user owns this profile. None on any failure.

    `GET /v1/doctors/{doctor_id}` is unauthenticated in doctor_service and
    already returns `user_id` in `DoctorProfileOut`, so this needs no token and
    no new cross-service surface.
    """
    try:
        resp = await client.get(f"/v1/doctors/{doctor_id}")
    except httpx.HTTPError as exc:
        print(f"  ! {doctor_id}: network error: {exc}")
        return None
    if resp.status_code != httpx.codes.OK:
        print(f"  ! {doctor_id}: upstream status {resp.status_code}")
        return None
    try:
        return UUID(str(resp.json()["user_id"]))
    except (ValueError, KeyError, TypeError) as exc:
        print(f"  ! {doctor_id}: unusable response: {exc}")
        return None


async def main() -> int:
    async with SessionLocal() as db:
        doctor_ids = list(
            (
                await db.scalars(
                    select(Booking.doctor_id).where(Booking.doctor_user_id.is_(None)).distinct()
                )
            ).all()
        )

        if not doctor_ids:
            print("nothing to backfill: no bookings have a NULL doctor_user_id")
            return 0

        print(f"resolving {len(doctor_ids)} distinct doctor profile(s) via {DOCTOR_SERVICE_URL}")
        resolved: dict[UUID, UUID] = {}
        async with httpx.AsyncClient(base_url=DOCTOR_SERVICE_URL, timeout=TIMEOUT) as client:
            for doctor_id in doctor_ids:
                user_id = await _resolve(client, doctor_id)
                if user_id is not None:
                    resolved[doctor_id] = user_id

        updated = 0
        for doctor_id, user_id in resolved.items():
            stmt = (
                update(Booking)
                .where(Booking.doctor_id == doctor_id)
                .where(Booking.doctor_user_id.is_(None))
                .values(doctor_user_id=user_id)
            )
            if DRY_RUN:
                pending = await db.scalar(
                    select(func.count())
                    .select_from(Booking)
                    .where(Booking.doctor_id == doctor_id)
                    .where(Booking.doctor_user_id.is_(None))
                )
                print(f"  = {doctor_id} -> {user_id} (dry run; {pending} row(s) would change)")
                continue
            result = await db.execute(stmt)
            updated += result.rowcount or 0
            print(f"  + {doctor_id} -> {user_id}")

        if DRY_RUN:
            await db.rollback()
            print("dry run: nothing written")
        else:
            await db.commit()

        unresolved = len(doctor_ids) - len(resolved)
        print(f"\nrows updated: {updated}; profiles unresolved: {unresolved}")
        if unresolved:
            print(
                "unresolved profiles leave their bookings NULL, which DENIES the "
                "practitioner read. Re-run once doctor_service can answer."
            )
            return 1
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

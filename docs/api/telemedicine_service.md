# API contract — `telemedicine_service`

**Prefix:** `/v1/rooms` · **Client:** `frontend/mobile/MedAPP/src/features/telehealth/api.ts`

> No new endpoints created.

## Routes

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/v1/rooms` | `RoomOut` (201) |
| GET | `/v1/rooms/{id}` | `RoomOut` |
| GET | `/v1/rooms/{id}/token` | `RoomTokenOut` |
| POST | `/v1/rooms/{id}/join` · `/leave` | `RoomJoinOut` |
| POST | `/v1/rooms/{id}/end` | `RoomOut` |
| GET | `/v1/rooms/{id}/messages` | **bare array** of `RoomMessageOut` |
| POST | `/v1/rooms/{id}/messages` | `RoomMessageOut` |

**There is no list-rooms endpoint.** `GET /v1/rooms` returns **405**; the `GET /` in the service is
its root handler, not a collection. Rooms are reached by id, and the app already has one —
`BookingOut.room_id` carries it, so a video appointment knows its own room.

Verified live: `GET /v1/rooms/{unknown}` → `404 {"detail":"room not found"}`, so the service is
reachable and authorising. The bare-array messages envelope was confirmed from
`response_model=list[RoomMessageOut]`, not inferred from the sibling services that share the habit.

## THE VIDEO HAS NO TRANSPORT

`GET /{id}/token` returns `{room_id, token, expires_at}`, but **nothing in the app consumes it** and
no provider SDK is installed anywhere — no Twilio, no Daily, no LiveKit.

So this service can drive the waiting room and the consultation shell — status, join, leave, end,
in-call chat — but the actual audio/video call has no implementation behind it. Wiring the screens
to this API makes them *honest about session state*; it does not make a call happen. Choosing a
provider is a product and cost decision, not a wiring one.

## Gaps and hazards

- **The token EXPIRES.** Fetch it at join time. A token collected on the appointments screen and
  used ten minutes later may be dead, and the failure would look like "video is broken".
- **`join`/`leave` are an AUDIT TRAIL, not presence.** `joined_at` / `left_at` record who was in a
  consultation and when — clinically meaningful — but nothing pushes, so a screen polls or re-reads.
  Do not build a "doctor is here now" indicator on them without a realtime channel.
- **`end` ends it for EVERYONE**, unlike `leave`. A patient dropping off should leave. The client
  keeps them as separate methods so they cannot be confused at a call site.
- **`recording_enabled` is on the room.** A recorded medical consultation needs explicit, visible
  consent from both parties — this flag must be surfaced, not merely honoured.
- **No pagination** on in-call messages.
- `status` is typed as an enum server-side but treated as free text by the client, matching how
  every other status field in this codebase has behaved.

## Migration note

The running container held only 2 of the 4 migration files — the image predated
`20260805_0003_access_audit` — so `alembic upgrade head` failed with
`Can't locate revision identified by '20260805_0003'`. A rebuild fixed it. **A stale image looks
exactly like a broken migration chain**; check the container's `alembic/versions` before debugging
the revisions themselves.

Also note this service already had `20260803_0002_timestamp_server_defaults`, so the sweep migration
added on 2026-08-07 is redundant here. It is idempotent (backfill, set default, re-assert NOT NULL)
and harmless, but it should have been skipped as inbox/hospital/lab were — those were spotted
because their existing fix was named `0003`, and this one was named `0002`.

## Wiring status

| Screen | State |
| --- | --- |
| Client (`features/telehealth/api.ts`) | Written; room fetch and auth verified live. |
| `waiting-room`, `telemedicine-consultation` | **Not wired** — no video transport exists, see above. |

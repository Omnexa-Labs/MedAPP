// Booking network calls.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS, AND WHAT IT IS FIXING
// ---------------------------------------------------------------------------
// `ReviewAppointmentScreen` held its own URL — `POST /v1/appointments` — and
// that route does not exist. `backend/services/api_gateway/app/config.py`
// ROUTES has no `/v1/appointments` key at all; the only service that defines
// that path is `hms_service`, which the gateway does not route and whose schema
// is a different shape anyway. Every real Confirm 404'd into the error branch,
// so `BookingConfirmedScreen` — and the whole expo-calendar handoff behind it —
// was unreachable. 595 tests passed over it because they mocked
// `@/lib/api/client`: a test that mocks the boundary cannot tell you the
// boundary is wrong.
//
// The contract below was read out of the service, not summarised from memory:
//   backend/services/booking_service/app/routers/bookings.py
//     router = APIRouter(prefix="/v1/bookings")   @router.post("") -> 201
//   backend/services/booking_service/app/schemas/booking.py
//     BookingCreate { doctor_id: UUID, starts_at, ends_at,
//                     reason?: str(<=255), notes?: str }
//     BookingOut    = BookingCreate + { booking_id, user_id, status,
//                                       cancelled_at?, cancellation_reason? }
//   backend/services/booking_service/app/services/booking_service.py
//     starts_at < ends_at; BOTH must be timezone-aware (naive is rejected with
//     "starts_at must be timezone-aware"); starts_at must be in the future;
//     overlapping BOOKED rows for the same doctor -> 400.
//   gateway ROUTES: "/v1/bookings": settings.booking_service_url  (line 64)
//
// THERE IS NO `booking_reference` AND NO `join_url` ANYWHERE IN THE BACKEND.
// Both were invented by the previous pass and are gone from the wire type here.
// Nothing in this file synthesises a human-readable reference out of
// `booking_id` — a fabricated reference on a medical confirmation is a number
// the patient reads out to a clinic that has never seen it. If the product
// needs one, that is a backend change; it is logged in docs/PIPELINE.md §5.
//
// Adapter philosophy mirrors `src/features/auth/api.ts` and
// `src/features/care/api.ts`: wire types are private to this module, app-facing
// types are camelCase and exported, and no screen ever sees snake_case or a URL.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none.

import { client } from "@/lib/api/client";
import { ApiError } from "@/types/api";

// ---- Wire shapes (exactly what the service sends/receives) ----------------

interface BookingCreateWire {
  doctor_id: string;
  /** RFC 3339 WITH an offset. A naive datetime is rejected by the service. */
  starts_at: string;
  ends_at: string;
  reason?: string;
  notes?: string;
}

interface BookingOutWire {
  booking_id: string;
  user_id: string;
  status: "booked" | "cancelled";
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  reason?: string | null;
  notes?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
}

// ---- App-facing types -----------------------------------------------------

/**
 * What the review screen carries and what the backend needs are not the same
 * shape: the screen has a local calendar date plus a wall-clock time string,
 * the service wants two offset-bearing instants. The conversion is this
 * module's job, not a screen's.
 */
export interface CreateBookingPayload {
  /**
   * REQUIRED — `BookingCreate.doctor_id` is a non-optional UUID. There is no
   * booking without a practitioner, so this is not optional here either; the
   * screen must refuse to submit rather than post a hole.
   */
  doctorId: string;
  /** Local calendar date, `YYYY-MM-DD` — what the date strip pushes. */
  date: string;
  /** Wall-clock start, `"10:00 AM"` or `"14:30"` — what a slot tile pushes. */
  time: string;
  /** Wall-clock end, same formats. Preferred over `durationMinutes`. */
  endTime?: string;
  /** Fallback when there is no `endTime`. See `resolveEnd` below. */
  durationMinutes?: number;
  /** Patient's reason for the visit. Service caps this at 255 characters. */
  reason?: string;
  notes?: string;
}

/**
 * The booking, as the app talks about it. Every field here is one the server
 * actually returned. There is deliberately no `bookingReference` and no
 * `joinUrl` — the backend has neither, and an optional field that can never be
 * populated is just an invitation to invent one later.
 */
export interface Booking {
  bookingId: string;
  userId: string;
  status: "booked" | "cancelled";
  doctorId: string;
  /** Server-echoed instants — these are what the calendar handoff schedules. */
  startsAtIso: string;
  endsAtIso: string;
  reason?: string;
  notes?: string;
  cancelledAtIso?: string;
  cancellationReason?: string;
}

// ---- Helpers --------------------------------------------------------------

/** Non-empty strings only; `null`, `""` and absent all collapse to `undefined`. */
function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * A composition failure is not a network failure, but it must reach the screen
 * through the same channel or the mutation resolves as a success with nothing
 * behind it. `status: 0` is the client's own "this never left the device" —
 * the review screen's generic copy ("Nothing has been booked and nothing has
 * been charged") is then literally true.
 */
function inputError(message: string): ApiError {
  return new ApiError(message, 0, "INVALID_BOOKING_INPUT");
}

/** `"2025-05-13"` -> `[2025, 5, 13]`, or null if it is not an ISO date. */
function parseIsoDate(value: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  return [Number(y), Number(mo), Number(d)];
}

/** `"10:00 AM"` / `"9:05 pm"` / `"14:30"` -> minutes since local midnight. */
function parseWallClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/.exec(value.trim());
  if (!m) return null;
  const [, rawHour, rawMinute, meridiem] = m;
  let hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem.toLowerCase() === "pm";
    hour = (hour % 12) + (pm ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/**
 * `Date` -> RFC 3339 with the device's UTC offset, e.g.
 * `"2025-05-13T10:00:00-04:00"`.
 *
 * NOT `toISOString()`. That would be a correct instant too, but it renders as
 * `...14:00:00Z`, and every log line, every 400 body and every eyeball
 * comparing the request against the frame then has to redo the arithmetic. The
 * offset form carries the wall-clock the patient chose AND the zone it was
 * chosen in, which is exactly the pair that has to be right.
 */
function toOffsetIso(date: Date): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  // getTimezoneOffset() is minutes to ADD to local to reach UTC, so it is the
  // negation of the offset written in an RFC 3339 timestamp.
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "-" : "+";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`
  );
}

/**
 * ---------------------------------------------------------------------------
 * TIMEZONE — the reasoning, because a booking in the wrong zone is a missed
 * appointment and this is the decision most likely to be wrong later.
 * ---------------------------------------------------------------------------
 *
 * What we have: a local calendar date (`"2025-05-13"`) and a wall-clock string
 * (`"10:00 AM"`). What the service needs: two offset-bearing instants — it
 * rejects naive datetimes outright and stores everything as UTC.
 *
 * What we do NOT have is the zone those wall-clock strings were minted in.
 * `useSlots` returns `{ time: "10:00 AM", period, available }` — display
 * strings, no instant, no zone. The frames print `"EDT · Boston"`, and the flow
 * carries it as a `timezone` PARAM, but that is a human label: it is not an
 * IANA id, it cannot be resolved to an offset without also knowing the date
 * (DST), and `"EDT · Boston"` in particular is a fixed abbreviation that is
 * simply wrong for the same clinic in January. Parsing it into an offset would
 * be the same class of mistake as inventing the endpoint — a plausible string
 * turned into a fact nobody checked.
 *
 * So the composition is explicitly DEVICE-LOCAL: the wall-clock is interpreted
 * in the zone the phone is in, and the resulting offset is stated on the wire.
 * That is exact whenever the patient is in the clinic's zone — the overwhelming
 * common case, and the only case any current frame depicts — and it is at least
 * unambiguous when they are not: the server receives a real instant, not a
 * guess dressed as one, and the failure mode is visible in the payload rather
 * than hidden in a silent UTC reinterpretation.
 *
 * The real fix is a backend one and is logged in docs/PIPELINE.md §5: the slots
 * endpoint must return each slot's `starts_at`/`ends_at` as instants (or, at
 * minimum, the practitioner's IANA zone), at which point this function is
 * deleted and the instant is passed straight through.
 *
 * Built from local Y/M/D/h/m parts via the `Date` constructor, never
 * `new Date("2025-05-13T10:00")` — string parsing of date-only forms is UTC per
 * spec and lands on the previous day west of Greenwich, which is precisely the
 * off-by-one this whole comment exists to prevent.
 */
function composeLocal(dateIso: string, wallClock: string): Date {
  const parts = parseIsoDate(dateIso);
  if (!parts) throw inputError(`Unrecognised appointment date: ${dateIso}`);
  const minutes = parseWallClock(wallClock);
  if (minutes === null) throw inputError(`Unrecognised appointment time: ${wallClock}`);
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0);
  if (Number.isNaN(date.getTime())) {
    throw inputError(`Unrecognised appointment date/time: ${dateIso} ${wallClock}`);
  }
  return date;
}

/**
 * `ends_at` is REQUIRED by `BookingCreate` and must be strictly after
 * `starts_at`, but screen 1 pushes only a start: `SelectTimeSlotScreen`'s
 * params-out is `{ date, time, mode, type, reason }`.
 *
 * Order of preference, most-authoritative first:
 *   1. `endTime` — a real end from the slot, when the flow carries one.
 *   2. `durationMinutes` — the provider's duration, when the flow carries one
 *      ("From provider" on 756:4356 is a provenance badge; it is only ever set
 *      from a param).
 *   3. `DEFAULT_SLOT_MINUTES` — a client-side ASSUMPTION, and the one piece of
 *      this payload the app does not actually know. It is here because the
 *      alternative is that no booking can be created at all, and it is capped
 *      at the shortest plausible consult so an assumed slot under-claims the
 *      clinician's calendar rather than over-claiming it. Logged in §5: slots
 *      must carry their own end.
 *
 * An `endTime` that is not after the start (a parse artefact, or a slot that
 * crosses midnight — which no frame draws) falls through to the duration rule
 * rather than posting a window the service will reject.
 */
const DEFAULT_SLOT_MINUTES = 30;

function resolveEnd(start: Date, payload: CreateBookingPayload): Date {
  const explicit = text(payload.endTime);
  if (explicit) {
    const end = composeLocal(payload.date, explicit);
    if (end.getTime() > start.getTime()) return end;
  }
  const minutes =
    payload.durationMinutes !== undefined && payload.durationMinutes > 0
      ? payload.durationMinutes
      : DEFAULT_SLOT_MINUTES;
  return new Date(start.getTime() + minutes * 60_000);
}

/** `reason` is `str | None = Field(max_length=255)` on the service. */
const REASON_MAX = 255;

// ---- Adapter --------------------------------------------------------------

function adaptBooking(b: BookingOutWire): Booking {
  return {
    bookingId: b.booking_id,
    userId: b.user_id,
    status: b.status,
    doctorId: b.doctor_id,
    startsAtIso: b.starts_at,
    endsAtIso: b.ends_at,
    reason: text(b.reason),
    notes: text(b.notes),
    cancelledAtIso: text(b.cancelled_at),
    cancellationReason: text(b.cancellation_reason),
  };
}

// ---- API surface ----------------------------------------------------------

export const BOOKINGS_PATH = "/v1/bookings";

export const bookingApi = {
  /**
   * POST /v1/bookings -> 201 BookingOut.
   *
   * Throws `ApiError` — status 409/400 from the service when the window
   * collides, status 0 when the payload could not be composed on-device or the
   * request never left it. The review screen already branches on `.status`.
   */
  async createBooking(payload: CreateBookingPayload): Promise<Booking> {
    const doctorId = text(payload.doctorId);
    if (!doctorId) throw inputError("This booking has no practitioner.");

    const start = composeLocal(payload.date, payload.time);
    const end = resolveEnd(start, payload);

    const body: BookingCreateWire = {
      doctor_id: doctorId,
      starts_at: toOffsetIso(start),
      ends_at: toOffsetIso(end),
    };

    // A reason over the service's 255-character cap would 422 the whole
    // booking. Rather than lose it or fail on it, the head goes in `reason` and
    // the FULL text goes in `notes`, which is unbounded free text — nothing is
    // silently dropped and nothing is silently truncated away.
    const reason = text(payload.reason);
    const notes = text(payload.notes);
    if (reason && reason.length > REASON_MAX) {
      body.reason = reason.slice(0, REASON_MAX);
      body.notes = notes ? `${reason}\n\n${notes}` : reason;
    } else {
      if (reason) body.reason = reason;
      if (notes) body.notes = notes;
    }

    // NOTE — consultation MODE ("video" / "in-person") and TYPE ("Standard
    // Consultation") are NOT sent. `BookingCreate` has no field for either, and
    // they are not smuggled into `notes`, where nothing reads them and they
    // would pollute a clinician-facing free-text field. This is a real drop,
    // not a rounding: to the booking service a video consultation and an
    // in-person one are the same row, which is also why no `join_url` comes
    // back. Logged in docs/PIPELINE.md §5.

    const wire = await client.post<BookingOutWire>(BOOKINGS_PATH, body);
    return adaptBooking(wire);
  },

  async listBookings(): Promise<Booking[]> {
    const wire = await client.get<{ items: BookingOutWire[] }>(BOOKINGS_PATH);
    return (wire.items ?? []).map(adaptBooking);
  },

  async getBooking(bookingId: string): Promise<Booking> {
    return adaptBooking(await client.get<BookingOutWire>(`${BOOKINGS_PATH}/${bookingId}`));
  },

  async cancelBooking(bookingId: string, cancellationReason?: string): Promise<Booking> {
    const wire = await client.post<BookingOutWire>(`${BOOKINGS_PATH}/${bookingId}/cancel`, {
      cancellation_reason: text(cancellationReason) ?? null,
    });
    return adaptBooking(wire);
  },
};

/** Exported for the tests that pin the composition rules. */
export const __testables = { composeLocal, toOffsetIso, resolveEnd, DEFAULT_SLOT_MINUTES };

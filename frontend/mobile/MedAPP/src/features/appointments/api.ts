// Appointments list API.
//
// The screen used to render two hardcoded arrays and issue no network request
// at all, above a comment promising `useQuery(["appointments"])` "once
// GET /v1/appointments ships". That endpoint does not exist and is not coming:
// the gateway routes `/v1/bookings` to booking_service (api_gateway/app/
// config.py), and that is where a booking made in this app actually lands. So
// a patient could complete the booking flow, get a 201, and never see the
// appointment again. This closes that loop.
//
// Two shapes have to be reconciled here, and neither is negotiable from this
// side:
//
//   BookingOut  { booking_id, user_id, doctor_id, starts_at, ends_at,
//                 status: "booked" | "cancelled", reason?, notes?,
//                 cancelled_at?, cancellation_reason?,
//                 mode: "in_person" | "video", room_id?: UUID | null }
//
//   the card    doctor name, specialty, avatar, facility, a human date line,
//               a status pill reading Confirmed / In Review / Completed, a
//               modality badge and — on a video visit — a join control
//
// `BookingOut` carries a `doctor_id` and nothing else about the clinician, so
// every row needs hydrating from doctor_service. See `hydrate` below for why
// that is a fan-out of `getDoctor` rather than one list call.

import { client, type RequestOptions } from "@/lib/api/client";
import { careApi, type DoctorSummary } from "@/features/care/api";

// ---- Wire ----------------------------------------------------------------

interface BookingOutWire {
  booking_id: string;
  user_id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  status: "booked" | "cancelled";
  reason?: string | null;
  notes?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  /**
   * `BookingMode(StrEnum) = in_person | video`, NOT NULL on the table with
   * `server_default 'in_person'`. Optional here only so a response from a
   * deployment predating migration 20260803_0002 still adapts.
   */
  mode?: "in_person" | "video";
  /**
   * The telemedicine room handle. `null` on every in-person booking AND on a
   * video booking whose room could not be provisioned — `provision_room` never
   * raises, so the booking still 201s with `room_id: null`. That is a documented
   * live state, not a bug, and the card must render it as pending rather than as
   * a join control with nothing behind it.
   *
   * There is no `join_url` to read. `telemedicine_service` has no URL concept —
   * joining is `GET /v1/rooms/{id}/token` then `POST /v1/rooms/{id}/join`.
   */
  room_id?: string | null;
}

interface BookingListWire {
  items: BookingOutWire[];
}

// ---- App-facing ----------------------------------------------------------

// The clock establishes that a scheduled time passed, not that a visit occurred.
export type AppointmentStatus = "confirmed" | "past" | "cancelled";

/**
 * How the consultation happens. Hyphenated to match the union the booking flow
 * already carries (`features/booking/api.ts`); the underscored `in_person` is a
 * wire spelling and stops at this module's edge.
 */
export type AppointmentMode = "in-person" | "video";

export interface Appointment {
  id: string;
  doctorId: string;
  /** Null while the doctor lookup is unresolved — see `hydrate`. */
  doctor: DoctorSummary | null;
  startsAtIso: string;
  endsAtIso: string;
  status: AppointmentStatus;
  reason?: string;
  cancellationReason?: string;
  /**
   * Stored on the booking. This is what the modality badge on 550:2613 renders,
   * and it is a fact now rather than a guess — the card used to have no way to
   * know, so the badge was left unbuilt.
   */
  mode: AppointmentMode;
  /**
   * Present only when a room was provisioned. `mode === "video" && !roomId` is
   * the third state 550:1826 needs: a video visit whose room is not ready yet.
   * The two must be read together — the absence of a room does not mean the
   * visit is in person.
   */
  roomId?: string;
}

export interface AppointmentBuckets {
  upcoming: Appointment[];
  past: Appointment[];
}

export const BOOKINGS_PATH = "/v1/bookings";

// ---- Helpers -------------------------------------------------------------

/**
 * Resolve the display status from the stored one plus the clock.
 *
 * A cancelled booking stays cancelled whether or not its time has passed —
 * "Completed" on an appointment nobody attended would be a lie, and on a
 * medical record a consequential one.
 */
function resolveStatus(w: BookingOutWire, now: number): AppointmentStatus {
  if (w.status === "cancelled") return "cancelled";
  return Date.parse(w.ends_at) <= now ? "past" : "confirmed";
}

/**
 * The wire spelling -> the app's, with in person as the fallback for absent or
 * unrecognised values.
 *
 * The errors are not symmetric, which is the whole reason for the direction:
 * "in person" on a video booking sends someone travelling, which they discover
 * and fix with a phone call; "video" on an in-person booking tells them to stay
 * home waiting for a session that does not exist. In person also renders no join
 * affordance, so a fallback can never produce a dead button.
 */
function resolveMode(mode: string | null | undefined): AppointmentMode {
  return mode === "video" ? "video" : "in-person";
}

/** `null`, `""` and absent all collapse to `undefined`. */
function id(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function adapt(w: BookingOutWire, now: number): Appointment {
  return {
    id: w.booking_id,
    doctorId: w.doctor_id,
    doctor: null,
    startsAtIso: w.starts_at,
    endsAtIso: w.ends_at,
    status: resolveStatus(w, now),
    reason: w.reason ?? undefined,
    cancellationReason: w.cancellation_reason ?? undefined,
    mode: resolveMode(w.mode),
    roomId: id(w.room_id),
  };
}

/**
 * Attach the clinician to each booking.
 *
 * One `getDoctor` per DISTINCT doctor, in parallel, rather than per booking —
 * a patient's history is typically a few clinicians seen repeatedly, so the
 * dedupe is most of the saving. `listDoctors` would be a single request but
 * the wrong one: it returns only `is_listable` doctors, and a booking with a
 * since-unlisted clinician would silently lose its name.
 *
 * A failed lookup leaves `doctor: null` instead of rejecting the whole list.
 * One unreachable doctor_service profile should cost that row its name, not
 * cost the patient sight of every appointment they have.
 */
async function hydrate(rows: Appointment[], options?: RequestOptions): Promise<Appointment[]> {
  const ids = [...new Set(rows.map((r) => r.doctorId))];
  const entries = await Promise.all(
    ids.map(async (id): Promise<[string, DoctorSummary | null]> => {
      try {
        return [id, await careApi.getDoctor(id, options)];
      } catch {
        return [id, null];
      }
    }),
  );
  const byId = new Map(entries);
  return rows.map((r) => ({ ...r, doctor: byId.get(r.doctorId) ?? null }));
}

// ---- API -----------------------------------------------------------------

export const appointmentsApi = {
  /**
   * Every booking for the signed-in patient, split for the two tabs.
   *
   * The server scopes by the bearer token, so there is no user id to pass.
   * Upcoming is ordered soonest-first (the next appointment is the one you
   * came to check); past is most-recent-first.
   */
  async listAppointments(options?: RequestOptions): Promise<AppointmentBuckets> {
    const wire = await client.get<BookingListWire>(BOOKINGS_PATH, options);
    const now = Date.now();
    const rows = await hydrate(
      (wire.items ?? []).map((w) => adapt(w, now)),
      options,
    );

    const upcoming = rows
      .filter((r) => r.status === "confirmed")
      .sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso));
    const past = rows
      .filter((r) => r.status !== "confirmed")
      .sort((a, b) => Date.parse(b.startsAtIso) - Date.parse(a.startsAtIso));

    return { upcoming, past };
  },

  /** `POST /v1/bookings/{id}/cancel`. */
  async cancelAppointment(
    id: string,
    cancellationReason?: string,
    options?: RequestOptions,
  ): Promise<void> {
    await client.post(
      `${BOOKINGS_PATH}/${id}/cancel`,
      { cancellation_reason: cancellationReason },
      options,
    );
  },
};

export const __testables = { adapt, resolveStatus, resolveMode, hydrate };

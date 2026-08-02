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
//                 cancelled_at?, cancellation_reason? }
//
//   the card    doctor name, specialty, avatar, facility, a human date line,
//               and a status pill reading Confirmed / In Review / Completed
//
// `BookingOut` carries a `doctor_id` and nothing else about the clinician, so
// every row needs hydrating from doctor_service. See `hydrate` below for why
// that is a fan-out of `getDoctor` rather than one list call.

import { client } from "@/lib/api/client";
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
}

interface BookingListWire {
  items: BookingOutWire[];
}

// ---- App-facing ----------------------------------------------------------

/**
 * What the card can honestly say.
 *
 * `booked` and `cancelled` are the only values `BookingStatus` has. The design
 * shows three pills — Confirmed, In Review, Completed — and **"In Review" has
 * no backend counterpart at all**; nothing in booking_service can produce a
 * pending state. It is therefore absent here rather than faked onto some
 * proxy, and the gap is logged in docs/PIPELINE.md §5 for the backend to
 * resolve. "Completed" is derived, not stored: a booking whose end time has
 * passed and which was never cancelled. That is an inference the client is
 * entitled to make from the clock, unlike a review state, which is a fact
 * about a workflow only the server knows.
 */
export type AppointmentStatus = "confirmed" | "completed" | "cancelled";

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
  return Date.parse(w.ends_at) <= now ? "completed" : "confirmed";
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
async function hydrate(rows: Appointment[]): Promise<Appointment[]> {
  const ids = [...new Set(rows.map((r) => r.doctorId))];
  const entries = await Promise.all(
    ids.map(async (id): Promise<[string, DoctorSummary | null]> => {
      try {
        return [id, await careApi.getDoctor(id)];
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
  async listAppointments(): Promise<AppointmentBuckets> {
    const wire = await client.get<BookingListWire>(BOOKINGS_PATH);
    const now = Date.now();
    const rows = await hydrate((wire.items ?? []).map((w) => adapt(w, now)));

    const upcoming = rows
      .filter((r) => r.status === "confirmed")
      .sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso));
    const past = rows
      .filter((r) => r.status !== "confirmed")
      .sort((a, b) => Date.parse(b.startsAtIso) - Date.parse(a.startsAtIso));

    return { upcoming, past };
  },

  /** `POST /v1/bookings/{id}/cancel`. */
  async cancelAppointment(id: string, cancellationReason?: string): Promise<void> {
    await client.post(`${BOOKINGS_PATH}/${id}/cancel`, { cancellation_reason: cancellationReason });
  },
};

export const __testables = { adapt, resolveStatus, hydrate };

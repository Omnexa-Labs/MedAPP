// Practitioner self-service API — the clinician's own schedule and own profile.
//
// ============================================================================
// WHY THIS FILE EXISTS
// ============================================================================
// `GET /v1/bookings/schedule` and `/schedule/summary` shipped doctor-scoped and
// had NO CLIENT AT ALL. This module is their first consumer, and the two screens
// it backs (practitioner-home, practitioner-profile) are the first practitioner
// surfaces in the app that read live data rather than seed constants — compare
// `features/practitioner/PractitionerSocialProfileScreen.tsx`, whose header still
// says "Seed data stands in until the practitioner service endpoint ships".
//
// It follows `features/appointments/api.ts`: wire types are private and
// snake_case, app-facing types are camelCase and exported, and every adaptation
// is a named function so the shape mismatch is documented rather than inlined.
//
// ============================================================================
// THE SCHEDULE IS A MINIMISED PROJECTION, AND THAT IS NOT A BUG TO ROUTE AROUND
// ============================================================================
// `BookingScheduleOut` deliberately WITHHOLDS `reason`, `notes` and
// `cancellation_reason` — its docstring cites Act 843 data minimisation and the
// HIPAA "minimum necessary" standard, and names `notes` as the highest-
// sensitivity field on the row. A list endpoint that sprayed every patient's
// clinical free text into one response body is exactly what it refuses to be.
//
// So there is no `reason` on `ScheduleEntry`, and the home card does not render
// one, even though the Figma frame draws "Persistent cough · follow-up" under the
// patient's name. Hydrating it back with a fan-out of `GET /v1/bookings/{id}`
// would defeat the minimisation on purpose and is NOT done here. See the FLAG
// block in PractitionerHomeScreen.tsx.
//
// ============================================================================
// PATIENTS ARE OPAQUE IDS. THERE IS NO NAME TO FETCH.
// ============================================================================
// `patient_id` is a user id and booking_service has no name for anyone — its own
// docstring: "resolving one here would turn a schedule into a patient list".
// There is also no client-side route to a name: `/v1/doctors` is the only
// person-directory the gateway exposes to this app, and a PATIENT is not in it.
// `careApi.getDoctor` resolves CLINICIANS, which is the opposite direction.
//
// So `ScheduleEntry.patientId` is carried raw and the screen renders a
// deterministic reference derived from it, never an invented name. The seeded
// roster's patient is Ama Mensah; putting that string on the card would be a
// hardcoded lie the moment a second patient books.
//
// ============================================================================
// THERE IS NO `GET /v1/doctors/me`. THIS IS THE WORKAROUND, AND IT IS A GAP.
// ============================================================================
// A signed-in clinician holds their `user_id` (the JWT `sub`, surfaced as
// `useCurrentUser().id`). Every doctor_service route is keyed by `doctor_id`,
// which is a DIFFERENT identifier, and nothing maps one to the other:
//
//   POST   /v1/doctors                  returns doctor_id — at creation only
//   GET    /v1/doctors?only_listable=   the list; no `user_id` filter
//   GET    /v1/doctors/{doctor_id}      needs the id we are trying to find
//   PATCH  /v1/doctors/{doctor_id}      ownership-enforced, needs it too
//
// `GET /v1/doctors/me` would 422, not 404 — `{doctor_id}` is typed `UUID` and
// swallows the literal segment.
//
// `findMyProfile` therefore lists with `only_listable=false` and scans for the
// row whose `user_id` matches the caller's. That is a REAL endpoint used as
// specified, not an invented one, and it is the only path that exists. Two
// consequences, both real and both flagged rather than hidden:
//
//   * it downloads the whole active-doctor roster to find one row. Fine at
//     seed scale (six clinicians), wrong at any real scale.
//   * `list_doctor_profiles` filters on `is_active`, so a deactivated clinician
//     finds nothing and the screen renders its "profile unavailable" state
//     rather than a half-populated one.
//
// The fix is a backend one — `GET /v1/doctors/me`, or a `user_id` filter on the
// list — and it is the single largest gap behind these two screens.
//
// No expo-* API is used in this module. Read
// https://docs.expo.dev/versions/v55.0.0/ before adding one.

import { client } from "@/lib/api/client";

// ---- Wire ----------------------------------------------------------------

/** `BookingScheduleOut`. Everything it carries, and nothing it does not. */
interface BookingScheduleWire {
  booking_id: string;
  /** An opaque user id. NOT a name, and there is nowhere to resolve one. */
  patient_id: string;
  starts_at: string;
  ends_at: string;
  status: "booked" | "cancelled";
  /**
   * `BookingMode(StrEnum) = in_person | video`. Optional here only so a
   * response from a deployment predating migration 20260803_0002 still adapts,
   * matching `features/appointments/api.ts`.
   */
  mode?: "in_person" | "video";
  /**
   * The telemedicine room handle, or null. Null is LEGAL on a video booking and
   * means "no room yet" — `provision_room` never raises, so a booking still
   * 201s with `room_id: null`. Render pending, never a dead join button.
   */
  room_id?: string | null;
}

interface BookingScheduleListWire {
  items: BookingScheduleWire[];
}

/** `DoctorProfileOut`. Mirrors `DoctorWire` in `features/care/api.ts`. */
interface DoctorProfileWire {
  doctor_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  specialty: string | null;
  bio: string | null;
  languages: string[];
  consultation_fee_cents: number | null;
  photo_url: string | null;
  is_listable: boolean;
  is_active: boolean;
}

interface DoctorListWire {
  items: DoctorProfileWire[];
}

/** `AvailabilityRuleOut`. `start_time`/`end_time` are bare times, not instants. */
interface AvailabilityRuleWire {
  rule_id: string;
  doctor_id: string;
  /** 0-6. The backend constrains `ge=0, le=6`; Monday-based per the seed data. */
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
  is_active: boolean;
}

interface AvailabilityRulesWire {
  items: AvailabilityRuleWire[];
}

// ---- App-facing ----------------------------------------------------------

/**
 * How the consultation happens. Hyphenated, matching `AppointmentMode` in
 * `features/appointments/api.ts`; the underscored `in_person` is a wire spelling
 * and stops at this module's edge.
 */
export type ConsultationMode = "in-person" | "video";

/**
 * `BookingStatus` has exactly two values and neither is derived. Note the
 * contrast with `AppointmentStatus` on the patient side, which synthesises
 * "completed" from the clock: a clinician's schedule renders a cancelled row
 * struck through rather than hiding it, because — per `BookingScheduleOut` —
 * "a cancelled row must render struck through, not silently vanish, or the
 * clinician cannot tell 'cancelled' from 'never booked'".
 */
export type ScheduleStatus = "booked" | "cancelled";

export interface ScheduleEntry {
  id: string;
  /**
   * The other party, as an opaque user id. There is deliberately no `patientName`
   * on this type — see the header. Use `patientReference()` for something
   * displayable.
   */
  patientId: string;
  startsAtIso: string;
  endsAtIso: string;
  status: ScheduleStatus;
  mode: ConsultationMode;
  /**
   * Present only when a room was provisioned. `mode === "video" && !roomId` is a
   * real, documented state — a video visit whose room is not ready. The two must
   * be read together; the absence of a room does not mean the visit is in person.
   */
  roomId?: string;
}

export interface PractitionerProfile {
  doctorId: string;
  userId: string;
  /** `Dr. First Last`, prefixed here for the same reason `careApi.getDoctor` does. */
  name: string;
  specialty: string | null;
  bio: string | null;
  languages: string[];
  consultationFeeCents: number | null;
  photoUrl: string | null;
  /** Whether patients can find this clinician in Find Care and book them. */
  isListable: boolean;
}

export interface AvailabilityRule {
  ruleId: string;
  /** 0 = Monday .. 6 = Sunday. */
  dayOfWeek: number;
  /** `HH:MM`, normalised from the wire's `HH:MM:SS`. */
  startTime: string;
  endTime: string;
  timezone: string;
}

export const SCHEDULE_PATH = "/v1/bookings/schedule";
export const DOCTORS_PATH = "/v1/doctors";

// ---- Adapters ------------------------------------------------------------

/**
 * The wire spelling -> the app's, with in person as the fallback for absent or
 * unrecognised values.
 *
 * Same asymmetry argument as the patient side, read from the clinician's chair:
 * "video" on an in-person booking offers a join button for a room that does not
 * exist, and a clinician who taps it waits for a patient who is in the waiting
 * room downstairs. In person renders no join affordance, so the fallback can
 * never produce a dead control.
 */
function adaptMode(mode: string | null | undefined): ConsultationMode {
  return mode === "video" ? "video" : "in-person";
}

/** `null`, `""` and absent all collapse to `undefined`. */
function optionalId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function adaptScheduleEntry(w: BookingScheduleWire): ScheduleEntry {
  return {
    id: w.booking_id,
    patientId: w.patient_id,
    startsAtIso: w.starts_at,
    endsAtIso: w.ends_at,
    // Not defaulted through a helper: `BookingStatus` is a closed two-value
    // enum, and anything else on the wire is a server bug that should be
    // visible as-is rather than coerced into "booked".
    status: w.status === "cancelled" ? "cancelled" : "booked",
    mode: adaptMode(w.mode),
    roomId: optionalId(w.room_id),
  };
}

function adaptProfile(w: DoctorProfileWire): PractitionerProfile {
  return {
    doctorId: w.doctor_id,
    userId: w.user_id,
    name: `Dr. ${w.first_name} ${w.last_name}`.trim(),
    specialty: w.specialty,
    bio: w.bio,
    languages: w.languages ?? [],
    consultationFeeCents: w.consultation_fee_cents,
    photoUrl: w.photo_url,
    isListable: w.is_listable,
  };
}

/** `09:00:00` -> `09:00`. Seconds are always zero here and add nothing. */
function trimSeconds(time: string): string {
  return /^\d{2}:\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : time;
}

function adaptRule(w: AvailabilityRuleWire): AvailabilityRule {
  return {
    ruleId: w.rule_id,
    dayOfWeek: w.day_of_week,
    startTime: trimSeconds(w.start_time),
    endTime: trimSeconds(w.end_time),
    timezone: w.timezone,
  };
}

// ---- API -----------------------------------------------------------------

export const practitionerApi = {
  /**
   * The caller's own schedule as the treating clinician.
   *
   * **Takes no identifier.** Authorization is the bearer token and nothing else,
   * which is what removes the IDOR an authorising `?doctor_id=` would create.
   * Passing one would be a filter at best and is not done.
   *
   * Returns every entry, both statuses, unsorted-by-contract. Callers narrow.
   */
  async listSchedule(): Promise<ScheduleEntry[]> {
    const wire = await client.get<BookingScheduleListWire>(SCHEDULE_PATH);
    return (wire.items ?? []).map(adaptScheduleEntry);
  },

  /**
   * The caller's own doctor profile, found by scanning the directory for their
   * `user_id`. See the header for why this is a scan and not a lookup.
   *
   * `only_listable=false` is essential, not an optimisation: the default is
   * `true`, and a clinician who has switched their Find Care listing OFF would
   * otherwise disappear from their own profile screen — precisely the state
   * frame 1022:918 exists to render.
   *
   * Returns `null` rather than throwing when no row matches. "This user has no
   * doctor profile" is a legitimate answer (an approved partner whose profile
   * was never created, or a deactivated one), and it is a different thing from
   * a network failure, which still rejects.
   */
  async findMyProfile(userId: string): Promise<PractitionerProfile | null> {
    const wire = await client.get<DoctorListWire>(`${DOCTORS_PATH}?only_listable=false`);
    const match = (wire.items ?? []).find((d) => d.user_id === userId);
    return match ? adaptProfile(match) : null;
  },

  /**
   * Turn the Find Care listing on or off.
   *
   * `PATCH /v1/doctors/{doctor_id}` with the single field. Ownership is enforced
   * server-side (`_ensure_mutation_access`: `profile.user_id == principal.subject`
   * unless admin), so a tampered `doctorId` is a 403 and not this client's
   * problem to police — but it is also never user-supplied here, it comes from
   * `findMyProfile`.
   *
   * `is_listable` is the ONLY field sent. `DoctorUpdate` is all-optional, so a
   * partial body is the specified shape, and echoing back name/bio/fee would
   * turn a visibility toggle into a full-profile overwrite that could clobber a
   * concurrent edit made elsewhere.
   */
  async setFindCareListing(doctorId: string, isListable: boolean): Promise<PractitionerProfile> {
    const wire = await client.patch<DoctorProfileWire>(`${DOCTORS_PATH}/${doctorId}`, {
      is_listable: isListable,
    });
    return adaptProfile(wire);
  },

  /**
   * The clinician's recurring weekly availability rules.
   *
   * Inactive rules are dropped here rather than at the screen: `is_active: false`
   * means the rule is not in force, and a consulting-hours line that included it
   * would tell a clinician they are open at a time patients cannot book.
   */
  async listAvailability(doctorId: string): Promise<AvailabilityRule[]> {
    const wire = await client.get<AvailabilityRulesWire>(
      `${DOCTORS_PATH}/${doctorId}/availability`,
    );
    return (wire.items ?? []).filter((r) => r.is_active).map(adaptRule);
  },
};

export const __testables = { adaptScheduleEntry, adaptProfile, adaptRule, adaptMode, trimSeconds };

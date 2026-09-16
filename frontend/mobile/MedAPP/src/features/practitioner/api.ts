import { client, type RequestOptions } from "@/lib/api/client";
import { ApiError } from "@/types/api";

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
 * "past" from the clock: a clinician's schedule renders a cancelled row
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
  async listSchedule(options?: RequestOptions): Promise<ScheduleEntry[]> {
    const wire = await client.get<BookingScheduleListWire>(SCHEDULE_PATH, options);
    return (wire.items ?? []).map(adaptScheduleEntry);
  },

  /** The authenticated doctor's record, including an unlisted profile. */
  async findMyProfile(
    userId: string,
    options?: RequestOptions,
  ): Promise<PractitionerProfile | null> {
    try {
      const wire = await client.get<DoctorProfileWire>(`${DOCTORS_PATH}/me`, options);
      if (wire.user_id !== userId) throw new ApiError("Profile identity mismatch", 502);
      return wire.is_active ? adaptProfile(wire) : null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
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
  async listAvailability(doctorId: string, options?: RequestOptions): Promise<AvailabilityRule[]> {
    const wire = await client.get<AvailabilityRulesWire>(
      `${DOCTORS_PATH}/${doctorId}/availability`,
      options,
    );
    return (wire.items ?? []).filter((r) => r.is_active).map(adaptRule);
  },
};

export const __testables = { adaptScheduleEntry, adaptProfile, adaptRule, adaptMode, trimSeconds };

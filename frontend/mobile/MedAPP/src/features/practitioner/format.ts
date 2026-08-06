// Presentation helpers shared by practitioner-home and practitioner-profile.
//
// These live in their own module, not in either screen, because BOTH screens
// render the same weekly-hours line from the same rules — home in its
// "Availability" card (Figma 1019:722) and profile in "Weekly availability"
// (1020:16173). Two copies of a day-range collapser would be two chances to
// disagree about whether Saturday is open, on the same data, in the same app.
//
// Everything here is a pure function of its arguments plus, where stated, an
// injected `now`. Nothing reads the clock implicitly — the greeting and the
// date line are time-dependent and therefore untestable if they call
// `Date.now()` internally, and "Good morning" on a screenshot taken at 11pm is
// the kind of defect that only shows up in review.
//
// No expo-* API is used here. Read https://docs.expo.dev/versions/v55.0.0/
// before adding one.

import type { AvailabilityRule } from "./api";

/**
 * Monday-first, matching `AvailabilityRule.dayOfWeek` (0-6) as the seed data
 * writes it. Deliberately NOT `Date.prototype.getDay()`'s Sunday-first
 * numbering — the two conventions collide on every index and the wire's is the
 * one the backend constrains (`ge=0, le=6`).
 */
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** `Date.getDay()` is Sunday-first; the rules are Monday-first. This is the shim. */
export function toRuleDay(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * The greeting's time-of-day word.
 *
 * Boundaries are the conventional ones (noon, 18:00) and are the CLIENT's local
 * time, not the availability rules' timezone. That is correct: the greeting
 * addresses the person holding the phone, whereas consulting hours describe when
 * patients may book — see `hoursTimezone` below, which is why the frame prints a
 * timezone chip next to the hours and none next to the greeting.
 */
export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The surname the greeting addresses, from a display name.
 *
 * `User.displayName` is the only name the app has for the signed-in person —
 * `adaptUser` folds `first_name` + `last_name` into it and keeps neither part.
 * So "Dr. Osei" is the LAST word of "Kwabena Osei", with any existing honorific
 * stripped first so a display name that already reads "Dr. Kwabena Osei" does
 * not render "Good morning, Dr. Dr. Osei".
 *
 * Returns `null` for an empty or whitespace-only name, so the caller can fall
 * back to an un-named greeting rather than "Good morning, Dr. ".
 */
export function surnameFor(displayName: string | null | undefined): string | null {
  const stripped = (displayName ?? "").trim().replace(/^(dr\.?|prof\.?)\s+/i, "");
  const parts = stripped.split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

/**
 * Up to two initials for the avatar fallback, from the same display name.
 *
 * The honorific is stripped for the same reason: "DK" for "Dr. Kwabena" would
 * initial a title. One-word names yield one letter rather than being padded.
 */
export function initialsFor(displayName: string | null | undefined): string | null {
  const stripped = (displayName ?? "").trim().replace(/^(dr\.?|prof\.?)\s+/i, "");
  const parts = stripped.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const letters = [parts[0], parts.length > 1 ? parts[parts.length - 1] : ""]
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase());
  return letters.join("");
}

/**
 * "Wednesday 5 August" — the frame's context line (1019:677).
 *
 * Hand-assembled rather than `toLocaleDateString`: Hermes ships without full ICU
 * on Android unless the app opts into `jsEngine` intl builds, so a locale format
 * string is not portable here and would silently degrade to a US ordering on
 * device while looking right in the simulator. Day and month names come from the
 * `Date`'s own accessors via a fixed table, which is deterministic everywhere.
 */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function longDate(now: Date): string {
  return `${DAY_NAMES[toRuleDay(now)]} ${now.getDate()} ${MONTH_NAMES[now.getMonth()]}`;
}

/** `09:00 – 09:30` for a consultation, from two instants, in local time. */
export function timeRange(startIso: string, endIso: string): string {
  return `${clockTime(startIso)} – ${clockTime(endIso)}`;
}

function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface WeeklyHours {
  /** e.g. "Mon – Fri · 09:00–17:00", or null when no rule is in force. */
  label: string | null;
  /** e.g. "Saturday and Sunday closed." — null when every day is covered. */
  closedLabel: string | null;
  /** The chip beside the hours (1019:722 renders "UTC"). Null when no rules. */
  timezone: string | null;
}

/**
 * Collapse availability rules into the frame's one-line summary.
 *
 * The frame draws a single "Mon – Fri · 09:00–17:00" line, which is only ever
 * honest when every open day shares one start and one end. When they DIFFER the
 * line becomes a per-day list ("Mon, Wed 09:00–13:00 · Tue 14:00–18:00") rather
 * than picking one range and dropping the rest — a clinician reading their own
 * consulting hours must not be shown hours they do not keep, and "show less" is
 * not available when the thing being summarised is the whole content.
 *
 * Contiguous runs of days collapse to "Mon – Fri"; non-contiguous ones stay a
 * comma list ("Mon, Wed, Fri"). A single day is just "Mon".
 */
export function weeklyHours(rules: AvailabilityRule[]): WeeklyHours {
  if (rules.length === 0) return { label: null, closedLabel: null, timezone: null };

  const byDay = [...rules].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const openDays = [...new Set(byDay.map((r) => r.dayOfWeek))].sort((a, b) => a - b);

  // The timezone chip. Every seeded rule shares one, but a clinician could hold
  // rules in two zones, and "UTC" beside hours partly kept in another is a
  // wrong statement — so mixed zones print neither.
  const zones = new Set(byDay.map((r) => r.timezone));
  const timezone = zones.size === 1 ? [...zones][0]! : null;

  const starts = new Set(byDay.map((r) => r.startTime));
  const ends = new Set(byDay.map((r) => r.endTime));

  const label =
    starts.size === 1 && ends.size === 1
      ? `${formatDayList(openDays)} · ${[...starts][0]}–${[...ends][0]}`
      : byDay.map((r) => `${DAY_SHORT[r.dayOfWeek]} ${r.startTime}–${r.endTime}`).join(" · ");

  const closed = DAY_NAMES.map((_, i) => i).filter((i) => !openDays.includes(i));
  const closedLabel =
    closed.length === 0
      ? null
      : `${joinWithAnd(closed.map((i) => DAY_NAMES[i]!))} closed.`;

  return { label, closedLabel, timezone };
}

/** "Mon – Fri" for a contiguous run, "Mon, Wed, Fri" otherwise. */
function formatDayList(days: number[]): string {
  if (days.length === 0) return "";
  if (days.length === 1) return DAY_SHORT[days[0]!]!;
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1]! + 1);
  return contiguous
    ? `${DAY_SHORT[days[0]!]} – ${DAY_SHORT[days[days.length - 1]!]}`
    : days.map((d) => DAY_SHORT[d]!).join(", ");
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * "GHS 120.00" from `consultation_fee_cents`.
 *
 * FLAGGED — the currency is ASSUMED, not read. `DoctorProfileOut` carries
 * `consultation_fee_cents: int | None` and NO currency field; nothing in
 * doctor_service records one. "GHS" is what the frame prints (1020:16144) and
 * what the seeded Accra/Kumasi roster implies, so it is what renders — but it is
 * a design constant here, not a fact from the server, and it will be wrong the
 * first time a clinician bills in anything else. The fix is a `currency` column.
 *
 * `null` means "no fee set", which is a different thing from a free
 * consultation, so it returns null and the caller omits the row rather than
 * printing "GHS 0.00".
 */
export function consultationFee(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return `GHS ${(cents / 100).toFixed(2)}`;
}

/**
 * What a schedule row can honestly call the other party.
 *
 * There is NO patient name available — see the header of `api.ts`. The frame
 * draws "Ama Mensah"; the wire carries a UUID and nothing that resolves it. This
 * returns a stable, recognisable short reference ("Patient 3f2a9c41") so the
 * clinician can at least match the row against the same id shown elsewhere,
 * instead of a fabricated name or a bare 36-character UUID.
 */
export function patientReference(patientId: string): string {
  const head = patientId.replace(/-/g, "").slice(0, 8);
  return head ? `Patient ${head}` : "Patient";
}

/** Two letters for the patient avatar. Derived from the id, since there is no name. */
export function patientInitials(patientId: string): string {
  return patientId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "PT";
}

/**
 * Today's still-relevant entries, soonest first.
 *
 * "Today" is the CLIENT's calendar day. That is the right frame for a screen
 * whose heading is "Today": the clinician is asking about the day they are
 * standing in, not the day their availability rules are denominated in.
 *
 * Cancelled entries are KEPT. `BookingScheduleOut` is explicit that a cancelled
 * row must render rather than vanish, "or the clinician cannot tell 'cancelled'
 * from 'never booked'".
 */
export function entriesToday<T extends { startsAtIso: string }>(entries: T[], now: Date): T[] {
  return entries
    .filter((e) => {
      const d = new Date(e.startsAtIso);
      return (
        !Number.isNaN(d.getTime()) &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    })
    .sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso));
}

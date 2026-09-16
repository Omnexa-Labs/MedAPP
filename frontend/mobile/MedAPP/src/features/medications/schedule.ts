// The dose schedule behind MedicationTrackerScreen, and the adherence figure
// derived from it.
//
// ===========================================================================
// ADHERENCE IS COMPUTED, NEVER WRITTEN DOWN
// ===========================================================================
// The frame (UI_screens/Patient_facing_screens/advanced_medication_timeline_tracker)
// shows "Great job! You've completed 66% of your daily medication schedule."
// above a grid of dose markers. The obvious build is a `66` in the JSX beside a
// hand-placed set of ticks — and then the headline and the grid are two
// independent assertions about the same day, free to disagree the moment either
// is edited. On a medication screen that disagreement is the bug: a patient
// reads "66%" over a grid showing four of four taken and cannot tell which is
// lying.
//
// So `adherenceOf` is the ONLY source of the number, and it reads the same dose
// list the grid renders. There is no literal percentage anywhere in this feature.
//
// ===========================================================================
// WHY `undefined` IS A RESULT, AND 0 IS NOT ITS STAND-IN
// ===========================================================================
// Before the first dose of the day falls due there is nothing to be adherent
// TO. Returning 0 there would render "You've completed 0% of your daily
// medication schedule" at 6am to a patient who has missed nothing — a reproach
// for a failure that has not happened. `adherenceOf` returns `undefined` for
// that day and the screen renders the absence as absence (no percentage line),
// which is the same stance MedicationDetailsScreen takes on a missing
// prescriber: a plausible invented value is worse than a missing row.
//
// ===========================================================================
// UPCOMING DOSES ARE NOT MISSES
// ===========================================================================
// The denominator is `taken + missed`, not `doses.length`. A 19:00 dose is not a
// failure at 13:00, and counting it as one would make adherence climb through
// the day from an opening figure that defames the patient.

import type { ActiveMedication } from "./types";

/**
 * A dose's state at the moment the screen renders.
 *
 * There is deliberately no `"due"`/`"now"` member. It would have to be derived
 * from the wall clock, which makes every render of the grid time-dependent and
 * every test of it clock-dependent, to distinguish a state that the design
 * draws no differently from `upcoming`. The vertical "now" line in the frame is
 * positional chrome, not a dose status — see `NOW_MINUTE` below.
 */
export type DoseStatus = "taken" | "missed" | "upcoming";

export type ScheduledDose = {
  id: string;
  /** Must match an `ActiveMedication.id`. Resolved by `dosesByMedication`. */
  medicationId: string;
  /**
   * Minutes from local midnight — 8am is `480`.
   *
   * NOT a `Date`. A `Date` carries a day, and two sources of truth for which day
   * a dose belongs to (the timestamp and the `DaySchedule` holding it) is how a
   * dose ends up rendered on the wrong row. The day lives on the schedule; the
   * dose carries only its time within that day.
   */
  minuteOfDay: number;
  status: DoseStatus;
};

export type DaySchedule = {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  doses: readonly ScheduledDose[];
};

/**
 * Percentage of DUE doses taken, floored, or `undefined` when none are due yet.
 *
 * Floored rather than rounded on purpose: 2 of 3 is 66.67%, and rounding it to
 * 67% overstates adherence. Where the two directions are "slightly understate"
 * and "slightly overstate" a patient's compliance with their prescription, this
 * screen understates. The frame's own figure is 66%, which is the floor.
 */
export function adherenceOf(schedule: DaySchedule): number | undefined {
  let taken = 0;
  let due = 0;
  for (const dose of schedule.doses) {
    if (dose.status === "upcoming") continue;
    due += 1;
    if (dose.status === "taken") taken += 1;
  }
  if (due === 0) return undefined;
  return Math.floor((taken / due) * 100);
}

/** Doses on a day, grouped by medication and ordered by time within each group. */
export function dosesByMedication(
  schedule: DaySchedule,
  medications: readonly ActiveMedication[],
): readonly { medication: ActiveMedication; doses: readonly ScheduledDose[] }[] {
  return medications.map((medication) => ({
    medication,
    doses: schedule.doses
      .filter((dose) => dose.medicationId === medication.id)
      .slice()
      .sort((a, b) => a.minuteOfDay - b.minuteOfDay),
  }));
}

/**
 * The distinct dose times on a day, ascending — the grid's columns.
 *
 * Derived from the doses rather than being a fixed 06/08/10/12 header like the
 * frame's, so a schedule with a 19:00 dose gets a 19:00 column instead of
 * silently dropping the marker off the right-hand edge.
 */
export function doseTimesOf(schedule: DaySchedule): readonly number[] {
  return [...new Set(schedule.doses.map((dose) => dose.minuteOfDay))].sort((a, b) => a - b);
}

/** `480` → `"08:00"`. 24-hour, zero-padded, locale-independent. */
export function formatMinuteOfDay(minuteOfDay: number): string {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Local `YYYY-MM-DD`. NOT `toISOString`, which converts to UTC and can shift the day. */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type StripDay = {
  /** Local `YYYY-MM-DD`, the key `DaySchedule.date` is compared against. */
  date: string;
  /** Short weekday, e.g. "Tue". */
  weekdayLabel: string;
  /** Day of month, e.g. "24". */
  dayLabel: string;
  /** Short month, e.g. "Oct" — `DatePill` requires it, and it must be real data. */
  monthLabel: string;
  isToday: boolean;
};

/**
 * The horizontal day selector: `before` days back through `after` days forward.
 *
 * `anchor` is passed in rather than read from the clock here for the same reason
 * the schedule builder takes a date — a module that reads `new Date()` cannot be
 * tested across a month boundary, which is precisely where day arithmetic breaks.
 * Constructing each day through the `Date` constructor (rather than adding
 * milliseconds) is what makes it survive DST transitions, where a day is 23 or 25
 * hours long.
 */
export function dayStrip(anchor: Date, before = 3, after = 3): readonly StripDay[] {
  const todayKey = localDateKey(anchor);
  const days: StripDay[] = [];
  for (let offset = -before; offset <= after; offset += 1) {
    const day = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + offset);
    const key = localDateKey(day);
    days.push({
      date: key,
      weekdayLabel: day.toLocaleDateString(undefined, { weekday: "short" }),
      dayLabel: String(day.getDate()),
      monthLabel: day.toLocaleDateString(undefined, { month: "short" }),
      isToday: key === todayKey,
    });
  }
  return days;
}

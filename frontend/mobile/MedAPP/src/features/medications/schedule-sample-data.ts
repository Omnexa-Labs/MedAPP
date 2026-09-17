// Reference display helpers retained for regression tests. Production medication data comes from medication-api.ts.
// The tracker uses server-generated slots; it does not use the sample adherence calculation.

import { SAMPLE_MEDICATIONS } from "./sample-data";
import type { DaySchedule } from "./schedule";

/**
 * Where the grid's "now" line sits on the sample day: 15:00.
 *
 * A constant rather than the wall clock, and it has to be, because the dose
 * statuses below are fixed. With a real `new Date()` the line would drift across
 * a static grid until it sat left of a dose marked `taken` — a dose taken in the
 * future — or right of one marked `upcoming`. The line and the statuses describe
 * the same instant, so they come from the same place.
 *
 * 15:00 is after the 13:00 dose (so `missed` is legible as a dose whose time has
 * passed) and before the 19:00 one (so `upcoming` is legible as one still to
 * come).
 */
export const SAMPLE_NOW_MINUTE = 15 * 60;

const AT = { morning: 8 * 60, midday: 13 * 60, evening: 19 * 60 } as const;

/**
 * The sample day, for whatever date the caller is showing.
 *
 * Adherence is NOT stated here. It falls out of these statuses via `adherenceOf`
 * — two taken, one missed, one upcoming, so two of three due, so 66%, which is
 * the figure the frame shows. Change a status and the headline moves with it;
 * that coupling is the point.
 */
export function buildSampleDaySchedule(date: string): DaySchedule {
  const [amlodipine, metformin, vitaminD3] = SAMPLE_MEDICATIONS;
  return {
    date,
    doses: [
      {
        id: "dose-amlodipine-morning",
        medicationId: amlodipine.id,
        minuteOfDay: AT.morning,
        status: "taken",
      },
      {
        id: "dose-metformin-breakfast",
        medicationId: metformin.id,
        minuteOfDay: AT.morning,
        status: "taken",
      },
      {
        id: "dose-vitamin-d3-midday",
        medicationId: vitaminD3.id,
        minuteOfDay: AT.midday,
        status: "missed",
      },
      {
        id: "dose-metformin-dinner",
        medicationId: metformin.id,
        minuteOfDay: AT.evening,
        status: "upcoming",
      },
    ],
  };
}

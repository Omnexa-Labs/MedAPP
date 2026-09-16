// SAMPLE DOSE SCHEDULE. NOT ANY PATIENT'S RECORD.
//
// There is no medication endpoint and therefore no dose-history endpoint either
// — the routing evidence is in the header of MedicationDetailsScreen.tsx. This
// file is the tracker's equivalent of ./sample-data.ts and is labelled on screen
// by the same `SAMPLE_NOTICE`.
//
// ===========================================================================
// THE DRUGS ARE THE ONES ALREADY IN ./sample-data.ts, NOT THE FRAME'S
// ===========================================================================
// The frame draws Lisinopril 10mg, Multivitamin, Metformin 500mg and
// Atorvastatin 20mg. Three of those four appear nowhere else in this app: the
// shipped sample list is Amlodipine, Metformin and Vitamin D3. Building the
// frame literally would put two different "your medications" lists one tap apart
// — the list screen naming three drugs and the tracker naming four others — and
// a patient reading both cannot reconcile them. Since both are sample data, the
// one that has to give is the frame.
//
// So doses reference `SAMPLE_MEDICATIONS` BY ID. A medication removed from that
// file takes its doses with it (`dosesByMedication` drops rows with no matching
// medication), and no drug name is spelled twice.
//
// The dose TIMES are taken from each medication's own `instructions`, so the grid
// agrees with the sig line the other two screens render:
//
//   Amlodipine  "once daily in the morning"          -> 08:00
//   Metformin   "with breakfast and dinner"          -> 08:00 + 19:00
//   Vitamin D3  "once daily with food"               -> 13:00
//
// ===========================================================================
// NO HARDCODED DATE. THIS IS THE "12 JUL" RULE.
// ===========================================================================
// The frame's header reads "October 2023 / Tue 24". A literal date is exactly the
// defect ActiveMedicationsScreen deleted when it removed "Offline · Updated 12
// Jul at 09:42" — "a fixed date that would still have said 12 Jul in 2027". So
// the schedule is BUILT FROM a date passed in rather than frozen into a
// constant, and the screen passes today's. That also keeps the module free of a
// clock read at import time, which is what makes it testable.

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

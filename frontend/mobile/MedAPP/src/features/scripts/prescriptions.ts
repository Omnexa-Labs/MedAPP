// The prescription list behind PrescriptionHistoryScreen.
//
// Lives in features/scripts/ rather than features/medications/ because this
// codebase already calls a prescription a "script" — ActiveScriptViewScreen and
// ActiveScriptShareScreen are its siblings, and "View details" on a card routes
// into the first of them.
//
// ===========================================================================
// A PRESCRIPTION IS NOT A MEDICATION, AND THE TWO LISTS MUST STILL AGREE
// ===========================================================================
// features/medications/sample-data.ts holds what the patient TAKES. This holds
// what was PRESCRIBED. They overlap but are not the same set, and the overlap is
// where they can contradict each other:
//
//   * Every ACTIVE prescription must correspond to an entry in
//     SAMPLE_MEDICATIONS, with the same prescriber — otherwise the medication
//     list names a drug the prescription list says was never prescribed.
//   * Vitamin D3 must NOT appear here at all. It is `source: "self-reported"`
//     with no prescriber, so there is no prescription behind it. A self-reported
//     supplement showing up in a prescription history is a fabricated clinical
//     record.
//   * A PAST or NEW prescription may name a drug absent from the medication
//     list, because a finished course is no longer taken and a just-issued
//     script has not been started.
//
// `prescriptions-sample-data.ts` asserts the first two of those in a test.

/**
 * Where a prescription sits in its life.
 *
 * These are the frame's three tabs (Active / New / Past). `new` is deliberately
 * not a boolean flag on `active`: the frame gives it its own tab, and a script
 * the patient has not yet acknowledged is a different thing from one they are
 * partway through.
 */
export type PrescriptionStatus = "active" | "new" | "past";

export type Prescription = {
  id: string;
  /** Rx number as printed on the script, forwarded to ActiveScriptViewScreen. */
  rxNumber: string;
  drugName: string;
  /** e.g. "500 mg · Oral capsule" — one string, because it is one line in the UI. */
  strengthAndForm: string;
  status: PrescriptionStatus;
  /**
   * Prescribing clinician. NOT optional, unlike `ActiveMedication.prescriberName`
   * — a prescription without a prescriber is not a prescription, whereas a
   * self-reported medication legitimately has none.
   *
   * Must name a clinician `scripts/seed_dev_data.py` creates. That file states
   * the rule directly: a screen needing a clinician the seed lacks gets the
   * clinician ADDED to the seed, so Find Care and the sample screens keep
   * agreeing. It is also where the frame's invented "Dr. Sarah Jenkins" was
   * caught before.
   */
  prescriberName: string;
  /** Local `YYYY-MM-DD`. Rendered by `formatIssuedDate`. */
  issuedDate: string;
  /**
   * The sig line as written — "Take 1 tablet at bedtime."
   *
   * OPTIONAL because a prescription record is not uniformly populated, and
   * NewPrescriptionScreen renders its absence as an absent section rather than as
   * an empty "About this medication" heading. Same stance as
   * `ActiveMedication.prescriberName` next door: on a clinical screen a
   * plausible invented value is worse than a missing row.
   *
   * Where a prescription corresponds to an entry in SAMPLE_MEDICATIONS this MUST
   * be that entry's `instructions` verbatim, not a paraphrase — a dosage line
   * that disagrees with itself between two screens is the drift that matters on a
   * medication record.
   */
  directions?: string;
};

/** The prescriptions in one tab, newest first. */
export function prescriptionsWithStatus(
  prescriptions: readonly Prescription[],
  status: PrescriptionStatus,
): readonly Prescription[] {
  return prescriptions
    .filter((prescription) => prescription.status === status)
    .slice()
    // String compare is correct for `YYYY-MM-DD` and avoids parsing entirely —
    // see `formatIssuedDate` for why parsing these is a trap.
    .sort((a, b) => b.issuedDate.localeCompare(a.issuedDate));
}

/** How many sit in each tab, so a tab can show a count without filtering twice. */
export function statusCounts(
  prescriptions: readonly Prescription[],
): Record<PrescriptionStatus, number> {
  const counts: Record<PrescriptionStatus, number> = { active: 0, new: 0, past: 0 };
  for (const prescription of prescriptions) counts[prescription.status] += 1;
  return counts;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * `"2026-08-10"` → `"10 Aug 2026"`.
 *
 * Formatted by SPLITTING THE STRING, never by `new Date("2026-08-10")`. That
 * constructor parses a bare date as UTC midnight, so in any negative-offset
 * timezone `getDate()` returns the 9th and every prescription in the list is
 * rendered a day early. Splitting the parts sidesteps the whole class of bug —
 * the same reason `localDateKey` in features/medications/schedule.ts refuses
 * `toISOString`.
 *
 * Returns the input unchanged if it is not a `YYYY-MM-DD` string, because a
 * malformed date on a clinical record should surface as itself rather than as
 * "NaN undefined NaN" or as a confidently wrong day.
 */
export function formatIssuedDate(issuedDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issuedDate);
  if (!match) return issuedDate;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return issuedDate;
  return `${Number(day)} ${monthName} ${year}`;
}

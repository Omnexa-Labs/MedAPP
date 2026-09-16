// SAMPLE PRESCRIPTIONS. NOT ANY PATIENT'S RECORD.
//
// There is no patient-facing prescription endpoint. `/v1/prescriptions` exists
// TWICE in the backend — pms_service and hms_service — and neither is reachable
// here: they are a pharmacy and a hospital system, gated on staff roles a patient
// does not hold, and the gateway namespaces them under `/v1/pms` and `/v1/hms`
// precisely so they cannot be mistaken for the patient surface. The evidence is
// in the header of features/medications/MedicationDetailsScreen.tsx.
//
// So this file plays the part ./sample-data.ts plays for medications, and the
// screen labels it with the same shared `SAMPLE_NOTICE`.
//
// ===========================================================================
// THE ACTIVE SCRIPTS MIRROR SAMPLE_MEDICATIONS. THAT IS ENFORCED BY A TEST.
// ===========================================================================
// The frame draws Amoxicillin (Dr. Sarah Jenkins) and Lisinopril (Dr. Michael
// Chen). Three problems with building that literally:
//
//   1. Neither prescriber is seeded. `scripts/seed_dev_data.py` records that
//      "Dr. Sarah Jenkins" was already invented once on another screen and
//      removed, with the rule spelled out: add the clinician to the seed, do not
//      invent one in a screen. The prescribers here are Dr. Adjoa Boateng
//      (Cardiology) and Dr. Kwabena Osei (General Practice) — the two already
//      named in features/medications/sample-data.ts, matched to the same drugs.
//   2. Lisinopril is not a drug this app has anywhere else. The patient's sample
//      antihypertensive is Amlodipine, and a prescription list naming a different
//      one puts two irreconcilable stories a tap apart.
//   3. Vitamin D3 is `self-reported` with no prescriber, so it has NO
//      prescription and must be absent from every tab here.
//
// Amoxicillin survives from the frame as the PAST script: a completed course is
// exactly the kind of prescription that should appear in a history and not in a
// current medication list, so it demonstrates the distinction rather than
// contradicting it.
//
// ===========================================================================
// DATES ARE RELATIVE TO A PASSED-IN DAY. NO FROZEN LITERALS.
// ===========================================================================
// The frame reads "Oct 12, 2023" / "Aug 05, 2023". Hardcoding those reproduces
// the defect ActiveMedicationsScreen removed as "a fixed date that would still
// have said 12 Jul in 2027" — and on this screen it is worse, because a
// prescription dated three years ago in the ACTIVE tab is a contradiction the
// patient can see. Offsets are in days back from the day the caller passes.

import { localDateKey } from "@/features/medications/schedule";
import { SAMPLE_MEDICATIONS } from "@/features/medications/sample-data";
import type { Prescription } from "./prescriptions";

/**
 * The statement, in one place, beside the data it describes — so deleting
 * `buildSamplePrescriptions` deletes the notice with it. This mirrors
 * `SAMPLE_NOTICE` in features/medications/sample-data.ts.
 *
 * Written out in full rather than derived from that constant by string
 * substitution: a `.replace("medications", "prescriptions")` silently returns the
 * original sentence the moment the source wording changes, and the failure mode
 * is a prescription screen claiming to be a medication screen.
 */
export const PRESCRIPTIONS_SAMPLE_NOTICE =
  "Sample data — these are not your prescriptions. They are the same entries for every account, and no prescription record has been loaded.";

/** Days back from the anchor for each sample script. */
const ISSUED_DAYS_AGO = {
  /** Repeat scripts, issued within the current cycle. */
  amlodipine: 28,
  metformin: 21,
  /** Just arrived — this is what puts an entry in the "New" tab. */
  atorvastatin: 1,
  /** A finished 7-day course, well in the past. */
  amoxicillin: 194,
} as const;

function daysBefore(anchor: Date, days: number): string {
  // Constructed through the Date constructor rather than by subtracting
  // milliseconds, so the arithmetic survives a DST boundary — where a day is 23
  // or 25 hours and millisecond maths lands on the wrong calendar date.
  return localDateKey(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - days));
}

/**
 * The sample scripts, dated relative to `anchor` (the screen passes today).
 *
 * `strengthAndForm` and the two active prescribers are read straight off
 * `SAMPLE_MEDICATIONS` rather than retyped, so the medication list and the
 * prescription list cannot drift on the facts they share. A drug renamed there
 * is renamed here; a prescriber changed there changes here.
 */
export function buildSamplePrescriptions(anchor: Date): readonly Prescription[] {
  const [amlodipine, metformin] = SAMPLE_MEDICATIONS;

  return [
    {
      id: "rx-amlodipine",
      rxNumber: "RX-4417-002",
      drugName: amlodipine.name,
      strengthAndForm: amlodipine.formAndStrength,
      status: "active",
      // Non-null asserted via a fallback rather than `!`: these two entries are
      // `source: "prescribed"` in sample-data.ts and therefore always carry a
      // prescriber, but a future edit there should fail loudly in the test that
      // checks this file against it, not silently render "undefined".
      prescriberName: amlodipine.prescriberName ?? "",
      issuedDate: daysBefore(anchor, ISSUED_DAYS_AGO.amlodipine),
      // Read off the medication, never retyped — see `Prescription.directions`.
      directions: amlodipine.instructions,
    },
    {
      id: "rx-metformin",
      rxNumber: "RX-4417-003",
      drugName: metformin.name,
      strengthAndForm: metformin.formAndStrength,
      status: "active",
      prescriberName: metformin.prescriberName ?? "",
      issuedDate: daysBefore(anchor, ISSUED_DAYS_AGO.metformin),
      directions: metformin.instructions,
    },
    {
      // NOT in SAMPLE_MEDICATIONS, and correctly so: a script issued yesterday
      // that the patient has not started is not yet something they take. Kept
      // with the cardiologist who prescribes the other cardiovascular drug here.
      id: "rx-atorvastatin",
      rxNumber: "RX-4417-004",
      drugName: "Atorvastatin",
      strengthAndForm: "Tablet · 20 mg",
      status: "new",
      prescriberName: "Dr. Adjoa Boateng",
      issuedDate: daysBefore(anchor, ISSUED_DAYS_AGO.atorvastatin),
      // Its own sig: Atorvastatin is not in SAMPLE_MEDICATIONS (it has not been
      // started), so there is no `instructions` to read it from.
      directions: "Take 1 tablet at bedtime.",
    },
    {
      id: "rx-amoxicillin",
      rxNumber: "RX-3980-001",
      drugName: "Amoxicillin",
      strengthAndForm: "Capsule · 500 mg",
      status: "past",
      prescriberName: "Dr. Kwabena Osei",
      issuedDate: daysBefore(anchor, ISSUED_DAYS_AGO.amoxicillin),
      // Left UNSET deliberately, so one sample record exercises the absent-sig
      // path: NewPrescriptionScreen must render a missing "About this medication"
      // as an omitted section, not as an empty heading.
    },
  ];
}

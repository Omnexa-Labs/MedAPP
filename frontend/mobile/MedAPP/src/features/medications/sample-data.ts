import type { ActiveMedication } from "./types";

/**
 * The one statement, in one place, so the surfaces that make it — the list
 * callout, the detail screen's provenance line, the shared export — cannot
 * drift into making it differently. It lives beside the data it describes, so
 * deleting `SAMPLE_MEDICATIONS` deletes the notice with it.
 */
export const SAMPLE_NOTICE = "Sample data — these are not your medications.";

/**
 * SAMPLE MEDICATIONS. NOT ANY PATIENT'S RECORD.
 *
 * Renamed from `ACTIVE_MEDICATIONS` in `mock-data.ts`, because the old name is
 * what the screen read and "active medications" is a clinical claim. Nothing
 * imports a constant called `SAMPLE_MEDICATIONS` by accident.
 *
 * These three entries are module-level and therefore identical for every
 * account, on every device, in every session — the same Amlodipine 5 mg for a
 * patient who takes none. Both screens that render them now say so on screen,
 * unmissably and in words, and `buildMedicationListText` stamps the same
 * statement onto anything shared out of the app. That labelling is the reason
 * this file is allowed to exist at all.
 *
 * There is no medication endpoint to replace it with — the routing evidence is
 * in the header of MedicationDetailsScreen.tsx, and the gap is recorded in
 * docs/api/README.md. When one ships, delete this file: the screen's `sample`
 * branch goes with it and `deriveMedicationsState` (./state.ts) is already the
 * seam the query plugs into.
 *
 * `prescriberName` / `refillsRemaining` are read only by the detail screen.
 * Vitamin D3 leaves both unset on purpose: it is `self-reported`, so there is no
 * clinician and no prescription behind it, and the detail screen renders that as
 * two absent rows rather than as a blank value or an invented one.
 *
 * Every `prescriberName` here must be a clinician that scripts/seed_dev_data.py
 * actually creates, because those are the doctors a tester sees in Find Care —
 * anyone else reads as a bug. The two prescribers are picked to match the seeded
 * specialties: Amlodipine (antihypertensive) sits with the cardiologist, and
 * Metformin sits with the GP whose seed bio covers chronic disease reviews.
 */
export const SAMPLE_MEDICATIONS: readonly ActiveMedication[] = [
  {
    id: "amlodipine-5",
    name: "Amlodipine",
    formAndStrength: "Tablet · 5 mg",
    instructions: "Take 1 tablet once daily in the morning.",
    source: "prescribed",
    prescriberName: "Dr. Adjoa Boateng",
    refillsRemaining: 0,
  },
  {
    // Plain Metformin, NOT extended-release. The two were contradicting each
    // other: ER is once-daily, which is where "with your evening meal" came
    // from, while the approved dosage on Active Medication Card 558:616 and on
    // the prescription screens is twice daily, "with breakfast and dinner".
    // The Figma canon settled on the immediate-release tablet, so the drug name
    // and the instruction line now agree with it and with each other.
    id: "metformin-500",
    name: "Metformin",
    formAndStrength: "Tablet · 500 mg",
    instructions: "Take 1 tablet with breakfast and dinner.",
    source: "prescribed",
    prescriberName: "Dr. Kwabena Osei",
    refillsRemaining: 2,
  },
  {
    id: "vitamin-d3",
    name: "Vitamin D3",
    formAndStrength: "Capsule · 1,000 IU",
    instructions: "Take 1 capsule once daily with food.",
    source: "self-reported",
  },
];

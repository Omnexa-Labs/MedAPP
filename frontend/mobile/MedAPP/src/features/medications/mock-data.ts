import type { ActiveMedication } from "./types";

/**
 * Deliberately local sample data; do not imply an unimplemented clinical API.
 *
 * There is no medication endpoint to point this at — the routing evidence is in
 * the header of MedicationDetailsScreen.tsx. Nothing here may be presented to a
 * user as a record that arrived from a provider.
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
export const ACTIVE_MEDICATIONS: readonly ActiveMedication[] = [
  {
    id: "amlodipine-5",
    name: "Amlodipine",
    formAndStrength: "Tablet · 5 mg",
    instructions: "Take 1 tablet once daily in the morning.",
    refillLabel: "Refill available in 6 days",
    refillAvailable: false,
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
    refillLabel: "2 refills remaining",
    refillAvailable: true,
    source: "prescribed",
    prescriberName: "Dr. Kwabena Osei",
    refillsRemaining: 2,
  },
  {
    id: "vitamin-d3",
    name: "Vitamin D3",
    formAndStrength: "Capsule · 1,000 IU",
    instructions: "Take 1 capsule once daily with food.",
    refillLabel: "Added by you",
    refillAvailable: false,
    source: "self-reported",
  },
];

// Reference fixtures only. Production medication screens load patient-owned EHR records.
import type { ActiveMedication } from "./types";

export const SAMPLE_NOTICE = "Sample data — these are not your medications.";

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

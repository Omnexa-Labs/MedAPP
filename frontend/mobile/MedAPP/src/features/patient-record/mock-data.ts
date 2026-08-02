import type { PatientRecord } from "./types";
import { TRIAGE_PATIENTS } from "@/features/roster2/mock-data";

const DEFAULT_VITALS = [
  { label: "Heart rate", value: "72", unit: "bpm", icon: "heart-rate" as const },
  {
    label: "Blood pressure",
    value: "145/92",
    unit: "mmHg",
    icon: "blood-pressure" as const,
    abnormal: true,
  },
  { label: "SpO₂", value: "98", unit: "%", icon: "oxygen-saturation" as const },
];

const DEFAULT_TIMELINE = [
  {
    id: "medication",
    title: "Medication administered",
    timestamp: "Today, 08:45",
    detail: "Metoprolol 25 mg given. Mild dizziness resolved after 10 minutes.",
    icon: "medication" as const,
  },
  {
    id: "consultation",
    title: "Consultation · Dr Miller",
    timestamp: "Yesterday, 16:20",
    detail: "Recovery remains on track. Continue vital checks every four hours.",
    icon: "medical-advice" as const,
  },
  {
    id: "lab",
    title: "Lab result uploaded",
    timestamp: "24 Mar, 11:30",
    detail: "Latest blood panel is ready to review.",
    icon: "lab-sample" as const,
    attachment: "Blood_Panel_V4.pdf",
  },
];

const PATIENT_CODES = [
  "PT-8821",
  "PT-7314",
  "PT-6408",
  "PT-5273",
  "PT-4186",
  "PT-3952",
  "PT-2847",
  "PT-1739",
  "PT-9624",
  "PT-8517",
  "PT-7402",
  "PT-6395",
  "PT-5280",
  "PT-4173",
] as const;

const rosterRecords: PatientRecord[] = TRIAGE_PATIENTS.map((patient, index) => ({
  id: patient.id,
  name: patient.name,
  initials: patient.initials,
  age: patient.age,
  ward: patient.ward,
  patientCode: PATIENT_CODES[index] ?? `PT-${8000 + index}`,
  reviewStatus: patient.workflowStatus === "needs-review" ? "Needs review" : "Up to date",
  reviewed: patient.id === "amina-mensah" ? "Reviewed 2h ago" : patient.updated,
  summary: patient.clinicalNote,
  vitals: DEFAULT_VITALS,
  timeline: DEFAULT_TIMELINE,
}));

rosterRecords[0] = {
  ...rosterRecords[0],
  summary:
    "Shortness of breath with a recent oxygen-saturation drop. Review current observations and care notes before the next cardiology round.",
};

export const PATIENT_RECORDS: readonly PatientRecord[] = [
  ...rosterRecords,
  {
    id: "marcus-chen",
    name: "Marcus Chen",
    initials: "MC",
    age: 59,
    ward: "Cardiology intake",
    patientCode: "PT-9106",
    reviewStatus: "Needs review",
    reviewed: "New intake",
    summary:
      "Post-MI follow-up and medication titration. Review the care plan before the first active-care consultation.",
    vitals: DEFAULT_VITALS,
    timeline: DEFAULT_TIMELINE,
  },
] as const;

export const DEFAULT_PATIENT_RECORD_ID = "amina-mensah";

export function findPatientRecord(id?: string): PatientRecord | undefined {
  return PATIENT_RECORDS.find((record) => record.id === (id ?? DEFAULT_PATIENT_RECORD_ID));
}

import type { HealthIconName } from "@/components/ui";

export type PatientRecordPreviewState =
  | "ready"
  | "loading"
  | "offline"
  | "not-found"
  | "vitals-unavailable"
  | "discharge-saved"
  | "discharge-failed";

export type RecordVital = {
  label: string;
  value: string;
  unit: string;
  icon: HealthIconName;
  abnormal?: boolean;
};

export type TimelineEntry = {
  id: string;
  title: string;
  timestamp: string;
  detail: string;
  icon: HealthIconName;
  attachment?: string;
};

export type PatientRecord = {
  id: string;
  name: string;
  initials: string;
  age: number;
  ward: string;
  patientCode: string;
  reviewStatus: "Needs review" | "Up to date";
  reviewed: string;
  summary: string;
  vitals: readonly RecordVital[];
  timeline: readonly TimelineEntry[];
};

export type Roster2ScreenState =
  | "ready"
  | "loading"
  | "empty"
  | "offline"
  | "review-saved"
  | "intake-accepted"
  | "intake-error";
export type RosterScope = "all" | "active" | "pending";
export type ClinicalFilter = "needs-review" | "critical" | "all";
export type RosterSort = "priority" | "latest";
export type TriageLevel = "Critical" | "Stable";
export type WorkflowStatus = "needs-review" | "up-to-date";

export type TriageMetric = {
  label: string;
  value: string;
  unit: string;
  status: "critical" | "normal";
};

export type TriagePatient = {
  id: string;
  name: string;
  initials: string;
  age: number;
  ward: string;
  condition: string;
  clinicalNote: string;
  level: TriageLevel;
  workflowStatus: WorkflowStatus;
  conditionGroup?: "Cardiology" | "Recovery" | "Medication" | "Discharge";
  updated: string;
  updatedAt: string;
  metrics: readonly TriageMetric[];
};

export type PendingIntake = {
  id: string;
  name: string;
  initials: string;
  referralReason: string;
  referredBy: string;
};

/** A local display model until the medication-record API is available. */
export type ActiveMedication = {
  id: string;
  name: string;
  formAndStrength: string;
  instructions: string;
  refillLabel: string;
  refillAvailable: boolean;
  source: "prescribed" | "self-reported";
};

export type MedicationScreenState = "ready" | "loading" | "empty" | "error" | "offline";

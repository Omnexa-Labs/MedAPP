/** Reference display model for fixtures. Live records use Course in medication-api.ts. */
export type ActiveMedication = {
  id: string;
  name: string;
  formAndStrength: string;
  instructions: string;
  source: "prescribed" | "self-reported";
  prescriberName?: string;
  refillsRemaining?: number;
};

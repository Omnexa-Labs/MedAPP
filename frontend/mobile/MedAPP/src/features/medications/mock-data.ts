import type { ActiveMedication } from "./types";

/** Deliberately local sample data; do not imply an unimplemented clinical API. */
export const ACTIVE_MEDICATIONS: readonly ActiveMedication[] = [
  {
    id: "amlodipine-5",
    name: "Amlodipine",
    formAndStrength: "Tablet · 5 mg",
    instructions: "Take 1 tablet once daily in the morning.",
    refillLabel: "Refill available in 6 days",
    refillAvailable: false,
    source: "prescribed",
  },
  {
    id: "metformin-500",
    name: "Metformin extended-release",
    formAndStrength: "Tablet · 500 mg",
    instructions: "Take 1 tablet with your evening meal.",
    refillLabel: "2 refills remaining",
    refillAvailable: true,
    source: "prescribed",
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

// Active Script — Share route. Thin wrapper; screen lives in feature.
// Pushed from the Overview screen's Active Scripts → "Share" action,
// carrying the script details as query params.

import { ClinicalPrescriptionDetailScreen } from "@/features/scripts/ClinicalPrescriptionScreens";

export default function ActiveScriptShareRoute() {
  return <ClinicalPrescriptionDetailScreen />;
}

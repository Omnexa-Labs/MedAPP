// Ask a doctor route — thin wrapper; the screen lives in the feature module.
// Figma 1106:18349, dark proof 1110:2789.
//
// Reached from the Community screen header, beside the Saved-posts button.
// That entry point is NOT optional and is not yet wired: `features/community/**`
// is owned by another agent this pass, so the one-line change is reported rather
// than made. `/(app)/onboarding-status` is a screen nothing in this app can
// reach; this must not become the second one.

import { AskADoctorScreen } from "@/features/qa/AskADoctorScreen";

export default function AskADoctorRoute() {
  return <AskADoctorScreen />;
}

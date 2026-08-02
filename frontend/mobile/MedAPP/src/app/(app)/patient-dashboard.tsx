// Patient Dashboard route — thin wrapper, screen component lives in feature.
//
// FLAGGED: not linked from BottomNav yet. This frame's content duplicates
// HomeScreen (Home tab) and the shipped "Overview" tab already points at a
// different, already-built screen (OverviewScreen.tsx). Wiring this into
// either existing tab slot is an IA decision for PM/lead, not something to
// resolve here — see PatientDashboardScreen.tsx's header comment. Reachable
// today only by direct navigation (e.g. router.push("/(app)/patient-dashboard"))
// for design/QA review.

import { PatientDashboardScreen } from "@/features/dashboard/PatientDashboardScreen";

export default function PatientDashboardRoute() {
  return <PatientDashboardScreen />;
}

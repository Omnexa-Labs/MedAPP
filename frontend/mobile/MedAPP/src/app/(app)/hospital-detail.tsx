// Hospital detail route — thin wrapper, screen component lives in the feature.
//
// Pushed from FindCareScreen's hospital card ("View hospital") with
// `?hospitalId=<hospital_id>`. A PUSHED screen: DetailShell gives it a back
// button and no bottom tab bar (docs/BRAND.md §App shell).
//
// Pharmacies go to `pharmacy-detail`, NOT here — see the per-kind routing note
// above `FacilityCard` in FindCareScreen.tsx.

import { HospitalDetailScreen } from "@/features/care/HospitalDetailScreen";

export default function HospitalDetailRoute() {
  return <HospitalDetailScreen />;
}

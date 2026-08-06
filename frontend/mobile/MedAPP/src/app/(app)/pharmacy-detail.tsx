// Pharmacy detail route — thin wrapper, screen component lives in the feature.
//
// Pushed from FindCareScreen's pharmacy card ("View Store") with
// `?pharmacyId=<pharmacy_id>`. A PUSHED screen: DetailShell gives it a back
// button and no bottom tab bar (docs/BRAND.md §App shell).
//
// Hospitals go to `hospital-detail`, NOT here — the two records share almost no
// sections and one screen switching two thirds of itself off is not a shared
// screen. See the per-kind routing note above `FacilityCard` in
// FindCareScreen.tsx.

import { PharmacyDetailScreen } from "@/features/care/PharmacyDetailScreen";

export default function PharmacyDetailRoute() {
  return <PharmacyDetailScreen />;
}

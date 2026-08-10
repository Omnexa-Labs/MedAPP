// Practitioner home route — thin wrapper.
//
// The `home` tab of the practitioner shell. Until 2026-08-05 that tab carried
// `href: null` and no-opped, because this destination did not exist.
//
// Distinct from `/(app)/index`, which is the PATIENT home. Two audiences, two
// shells, two homes — the practitioner bar must never route into the patient one.

import { PractitionerHomeScreen } from "@/features/practitioner/PractitionerHomeScreen";

export default function PractitionerHomeRoute() {
  return <PractitionerHomeScreen />;
}

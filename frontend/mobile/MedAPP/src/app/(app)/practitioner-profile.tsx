// Practitioner profile route — thin wrapper.
//
// The `profile` tab of the practitioner shell, dead until 2026-08-05.
//
// NOT practitioner-social-profile or practitioner-telehealth-profile: both of
// those are PATIENT-facing views of a specialist. This is the clinician's own
// profile, and it is where the account menu lives (PO ruling) — so it is also
// the only route from which a clinician can sign out.

import { PractitionerProfileScreen } from "@/features/practitioner/PractitionerProfileScreen";

export default function PractitionerProfileRoute() {
  return <PractitionerProfileScreen />;
}

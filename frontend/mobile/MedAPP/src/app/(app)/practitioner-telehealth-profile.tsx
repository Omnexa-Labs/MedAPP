// Specialist telehealth profile route — thin wrapper.
// Reached from Find Care → PersonCard → "View Profile".
// Distinct from practitioner-social-profile, which is the social identity screen.

import { PractitionerTelehealthProfileScreen } from "@/features/practitioner/PractitionerTelehealthProfileScreen";

export default function PractitionerTelehealthProfileRoute() {
  return <PractitionerTelehealthProfileScreen />;
}

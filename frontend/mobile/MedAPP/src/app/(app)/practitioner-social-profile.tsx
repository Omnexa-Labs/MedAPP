// Specialist social profile route — thin wrapper.
// Reached from Explore → "View Profile" or Community → practitioner mention.
// Distinct from practitioner-telehealth-profile, which will handle booking.

import { PractitionerSocialProfileScreen } from "@/features/practitioner/PractitionerSocialProfileScreen";

export default function PractitionerSocialProfileRoute() {
  return <PractitionerSocialProfileScreen />;
}

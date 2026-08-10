// Patient Profile Overview route — thin wrapper, screen component lives in
// the feature module (see PatientProfileOverviewScreen.tsx header comment
// for the full translation/deviation log).
//
// Not yet wired into BottomNav (its 5 tabs are Home/Overview/Inbox/Community/
// Lifestyle — none maps to "Profile"). Reachable today via direct push, e.g.
// `router.push("/(app)/patient-profile-overview")` from a header avatar.

import { PatientProfileOverviewScreen } from "@/features/profile/PatientProfileOverviewScreen";

export default function PatientProfileOverviewRoute() {
  return <PatientProfileOverviewScreen />;
}

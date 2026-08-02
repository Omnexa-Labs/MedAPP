// Partner Onboarding Status route — thin wrapper, screen lives in the feature
// module (see OnboardingStatusScreen.tsx's header for the full translation and
// deviation log).
//
// Sits in the authenticated group: the user has already applied, so they have a
// session and a `partner.status`. The screen renders whatever that status is.
//
// FLAGGED: nothing links here yet. The web onboarding hand-back
// (`medapp://partner/...`, per features/partner/README.md and
// lib/partner/open-onboarding.ts) is the natural entry point, and the partner
// deep-link handler isn't built. Reachable today via
// `router.push("/(app)/onboarding-status")` for design/QA review.
//
// It is deliberately NOT registered on the patient BottomNav
// (features/home/components/BottomNav.tsx). Frame 72:117 instances the approved
// PRACTITIONER shell — "Practitioner BottomNav" 381:628, Active=Home — which is
// a different tab set for a different audience and now lives in
// src/components/shell/. Conversely, no practitioner tab routes here either:
// there is no practitioner home route for the Home tab to point at, so that tab
// no-ops (see PractitionerBottomNav's route table).

import { OnboardingStatusScreen } from "@/features/partner/OnboardingStatusScreen";

export default function OnboardingStatusRoute() {
  return <OnboardingStatusScreen />;
}

// Saved posts route — thin wrapper; the screen lives in the feature module.
//
// Reached from the bookmark button in the Community feed header. That entry
// point is not optional: `/(app)/onboarding-status` is a screen nothing in this
// app can reach, and a Saved list with no way in would be the second one.

import { SavedPostsScreen } from "@/features/community/SavedPostsScreen";

export default function SavedPostsRoute() {
  return <SavedPostsScreen />;
}

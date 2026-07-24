// Community route — thin wrapper, screen component lives in feature.
// Reached from the BottomNav "Community" tab and Home's "Socials" tile.

import { CommunityScreen } from "@/features/community/CommunityScreen";

export default function CommunityRoute() {
  return <CommunityScreen />;
}

// Overview route — thin wrapper, screen component lives in feature.
// Reached from the BottomNav "Overview" tab.

import { OverviewScreen } from "@/features/overview/OverviewScreen";

export default function OverviewRoute() {
  return <OverviewScreen />;
}

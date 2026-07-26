// Find Care route — thin wrapper, screen component lives in feature.
// Pushed from HomeScreen's Quick Services → "Find Care" tile.

import { FindCareScreen } from "@/features/care/FindCareScreen";

export default function FindCareRoute() {
  return <FindCareScreen />;
}

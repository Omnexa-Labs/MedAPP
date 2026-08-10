// Test-only helper: render a tree that uses react-native-safe-area-context.
//
// `useSafeAreaInsets()` throws "No safe area value available" without a
// provider, and the shell components legitimately need the inset (the 393x1283
// Figma canvas has no gesture bar, so the bottom nav has to add it at runtime).
// Passing `initialMetrics` gives the provider synchronous values, which is what
// the library documents for tests — otherwise insets resolve after a native
// layout pass that never happens under Jest.
//
// Metrics are a Pixel-class device: the 393px canonical viewport from
// docs/BRAND.md, with a notch and a gesture bar so inset handling is actually
// exercised rather than zeroed out.

import type * as React from "react";
import { render } from "@testing-library/react-native";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";

export const TEST_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function renderWithSafeArea(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={TEST_METRICS}>{ui}</SafeAreaProvider>);
}

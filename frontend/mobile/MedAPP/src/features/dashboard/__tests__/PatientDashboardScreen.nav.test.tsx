// Locks patient-dashboard's CHROME to DetailShell, and its back button to a
// destination that exists.
//
// This screen was the worst case in the chrome audit and it took two passes to
// get right. First it rendered the five-tab bar with no `onTabPress` at all, so
// every tab was inert — a bar that looks like navigation and is not. That was
// fixed by adopting PatientShell's shared tab map. The PO ruling of 2026-08-05
// went further: this screen is on NO tab (its own header says it is "NOT
// registered on any BottomNav tab" pending an IA call), so it may not wear the
// tab bar at all. The bar could only ever have highlighted a lie.
//
// The tab-map contract those old assertions locked is still live and still
// tested — on the screens that legitimately show the bar, in
// components/shell/__tests__/PatientShell.test.tsx.
//
// THE BACK BUTTON IS THE POINT OF THIS FILE. Nothing in the product pushes
// `/(app)/patient-dashboard` — the only reference in `src/` is the gitignored
// preview harness — so DetailAppBar's default `router.back()` would render a
// chevron that silently does nothing on the one path that reaches this screen.
// The screen supplies its own `onBack` with a Home fallback, and that fallback is
// asserted below with `canGoBack()` returning FALSE, which is the state a cold
// deep link actually arrives in. A test that only ever runs with history present
// would pass against the broken version.

import { screen, fireEvent } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
/** Flipped per-test: the whole point is that the false branch is exercised. */
// `mock`-prefixed because jest.mock() factories are hoisted above this
// declaration and the out-of-scope guard only exempts that prefix.
let mockCanGoBack = true;

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: () => mockCanGoBack,
  },
}));

jest.mock("@/store/auth-store", () => ({
  useAuthStore: () => ({ user: null }),
}));

import { PatientDashboardScreen } from "../PatientDashboardScreen";

describe("PatientDashboardScreen chrome", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockReplace.mockClear();
    mockCanGoBack = true;
  });

  it("shows NO bottom tab bar — it is registered on no tab", () => {
    render(<PatientDashboardScreen />);

    for (const tab of [
      "Home",
      "Overview",
      "Inbox",
      "Community",
      "Lifestyle",
      "Schedule",
      "Patients",
      "Profile",
    ]) {
      expect(screen.queryByLabelText(tab)).toBeNull();
    }
  });

  it("shows NO logo — it belongs only on tab-root screens", () => {
    render(<PatientDashboardScreen />);
    expect(screen.queryByLabelText("MedApp")).toBeNull();
  });

  it("pops the stack when there IS history", () => {
    render(<PatientDashboardScreen />);

    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("falls back to Home when there is NO history — the screen has no inbound link", () => {
    // The real case. DetailAppBar's default would no-op here, leaving a visible
    // control that does nothing on a screen the user cannot otherwise leave.
    mockCanGoBack = false;
    render(<PatientDashboardScreen />);

    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
    expect(mockBack).not.toHaveBeenCalled();
    // `replace`, not `push`: a screen with no inbound link should not deepen the
    // stack on the way out.
    expect(mockPush).not.toHaveBeenCalled();
  });
});

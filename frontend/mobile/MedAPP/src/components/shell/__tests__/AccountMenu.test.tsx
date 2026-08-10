// AccountMenu — the account menu behind the patient app bar's avatar.
//
// These cases exist because every one of them was, until this batch, a hole in
// the product rather than a regression risk:
//
//   * `signOut()` was implemented in the auth store and CALLED FROM NOWHERE.
//     There was no way to sign out of MedApp at all.
//   * `/(app)/patient-profile-overview` was a built, Figma-verified screen that
//     nothing linked to.
//   * `<AppearanceSelector />` — the three-way light/dark/system preference — was
//     referenced only by the barrel that exported it.
//
// So the assertions below are not "does the menu render"; they are "is each of
// those three things reachable, and does the destructive one cost two taps".

import { render as renderBare, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

const mockReplace = jest.fn();
const mockNavigate = jest.fn();
// `push` is mocked ONLY so "must not push" can be asserted. Nothing in this
// component may call it.
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
    canGoBack: () => true,
  },
}));

// The store is reached by a LAZY `require` inside the component (see the note in
// AccountMenu.tsx: a static import pulls in @/lib/config, which throws at require
// time under Jest). `jest.mock` intercepts that lazy require, which is what makes
// the real sign-out path assertable at all.
const mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock("@/store/auth-store", () => ({
  useAuthStore: { getState: () => ({ signOut: mockSignOut }) },
}));

import {
  AccountMenu,
  accountMenuWidth,
  ACCOUNT_MENU_PROFILE_HREF,
  SIGN_OUT_HREF,
} from "../AccountMenu";

const onClose = jest.fn();

function open(props: Partial<React.ComponentProps<typeof AccountMenu>> = {}) {
  return render(<AccountMenu visible onClose={onClose} {...props} />);
}

describe("AccountMenu", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockNavigate.mockClear();
    mockPush.mockClear();
    mockSignOut.mockClear();
    onClose.mockClear();
  });

  // -------------------------------------------------------------------------
  // 360dp WIDTH ARITHMETIC
  //
  // Asserted on the pure clamp rather than through a render, because
  // `useWindowDimensions()` under Jest reports the harness's metrics, not a
  // device's — the one thing a render here could NOT tell us is what happens at
  // 360. The numbers matter: <AppearanceSelector /> is three `flex-1` cells,
  // each needing px-sm x2 (24) + icon 18 + gap-xs 4 + "System" at label-md
  // (~50) = 96dp, so 288 + its p-xs x2 (8) + border x2 (2) = 298dp of content.
  // The panel's 4dp padding means the panel itself must be >= 306.
  // -------------------------------------------------------------------------
  it("is 320 wide on the 360dp device the defect session used", () => {
    // min(320, 360 - 16*2) = min(320, 328) = 320. Content = 320 - 8 = 312 >= 298.
    expect(accountMenuWidth(360)).toBe(320);
  });

  it("is the same 320 on the 393dp design canvas", () => {
    // Identical, which is the point: the panel does not change size between the
    // canvas the frames are drawn at and the device they were tested on.
    expect(accountMenuWidth(393)).toBe(320);
  });

  it("never touches the screen edge on a narrower device than either", () => {
    // 320dp phones exist (and 16dp of margin each side must survive on them).
    // The clamp gives up width, never the margin: 320 - 32 = 288.
    expect(accountMenuWidth(320)).toBe(288);
    expect(accountMenuWidth(360)).toBeLessThanOrEqual(360 - 32);
    expect(accountMenuWidth(393)).toBeLessThanOrEqual(393 - 32);
  });

  it("keeps enough content width for AppearanceSelector's three cells at 360dp", () => {
    // The 298dp figure derived above, asserted as the invariant it is: this is
    // the number that rules out a 280 panel (272 content — 26dp short, so
    // "System" would wrap or clip on the device).
    const APPEARANCE_SELECTOR_MIN = 298;
    const PANEL_PADDING = 4 * 2;
    expect(accountMenuWidth(360) - PANEL_PADDING).toBeGreaterThanOrEqual(APPEARANCE_SELECTOR_MIN);
  });

  // -------------------------------------------------------------------------
  // The three things that were unreachable
  // -------------------------------------------------------------------------

  it("links Profile to the previously-orphaned profile route", () => {
    open();
    fireEvent.press(screen.getByLabelText("Profile"));
    expect(mockNavigate).toHaveBeenCalledWith(ACCOUNT_MENU_PROFILE_HREF);
    expect(ACCOUNT_MENU_PROFILE_HREF).toBe("/(app)/patient-profile-overview");
    // `navigate`, not `push`: Patient Profile Overview renders this same bar, so
    // a push from it would stack a second copy of the screen already on screen.
    expect(mockPush).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("gives the orphaned AppearanceSelector a home", () => {
    open();
    // The selector's own radiogroup and all three of its options — a two-way
    // toggle here would strand the users who want to follow the OS, which is why
    // the component is a three-way control in the first place.
    expect(screen.getByLabelText("Appearance")).toBeTruthy();
    expect(screen.getByLabelText("System")).toBeTruthy();
    expect(screen.getByLabelText("Light")).toBeTruthy();
    expect(screen.getByLabelText("Dark")).toBeTruthy();
  });

  it("offers a sign out at all", () => {
    open();
    expect(screen.getByLabelText("Sign out")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Sign out is CONFIRMED — one tap must not end the session
  // -------------------------------------------------------------------------

  it("does not sign out or navigate on the first tap", () => {
    open();
    fireEvent.press(screen.getByLabelText("Sign out"));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    // It swapped to the confirmation instead of doing the thing.
    expect(screen.getByText("Sign out?")).toBeTruthy();
  });

  it("returns to the menu, still signed in, when the confirmation is declined", () => {
    open();
    fireEvent.press(screen.getByLabelText("Sign out"));
    fireEvent.press(screen.getByLabelText("Stay signed in"));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Profile")).toBeTruthy();
  });

  it("clears the session on the second tap", async () => {
    open();
    fireEvent.press(screen.getByLabelText("Sign out"));
    // Two nodes are now labelled "Sign out" over the component's life, but only
    // the confirm button is mounted in this view, so the query is unambiguous.
    fireEvent.press(screen.getByLabelText("Sign out"));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it("navigates to sign-in ITSELF rather than waiting for the (app) guard", async () => {
    open();
    fireEvent.press(screen.getByLabelText("Sign out"));
    fireEvent.press(screen.getByLabelText("Sign out"));
    // The guard in (app)/_layout would also redirect — after a frame of
    // authenticated UI has painted. This is the deliberate navigation.
    expect(mockReplace).toHaveBeenCalledWith(SIGN_OUT_HREF);
    expect(SIGN_OUT_HREF).toBe("/(public)/sign-in");
    // `replace`, never `push`: a signed-out user must not be able to swipe back
    // into the authenticated stack.
    expect(mockPush).not.toHaveBeenCalled();
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it("navigates BEFORE it clears state, not after", async () => {
    open();
    fireEvent.press(screen.getByLabelText("Sign out"));
    fireEvent.press(screen.getByLabelText("Sign out"));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    // ORDER, not tick — asserted on the call order rather than on "signOut hasn't
    // happened yet", because that would be testing an implementation detail of
    // how lazily the store is loaded. What matters is that the navigation is
    // already queued when the session starts being torn down, so the (app)
    // guard's <Redirect> never becomes the thing that moves the user.
    expect(mockReplace.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0],
    );
  });

  it("reopens on the menu, never on a half-finished confirmation", () => {
    open();
    fireEvent.press(screen.getByLabelText("Sign out"));
    expect(screen.getByText("Sign out?")).toBeTruthy();
    // Dismissing the confirmation resets the view as part of closing, so the
    // NEXT open lands on the menu.
    fireEvent.press(screen.getByLabelText("Close confirmation"));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText("Sign out?")).toBeNull();
    expect(screen.getByLabelText("Profile")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Dismissal — a modal with no way out is a trap
  // -------------------------------------------------------------------------

  it("closes on a backdrop tap", () => {
    open();
    fireEvent.press(screen.getByLabelText("Close account menu"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when the panel itself is tapped", () => {
    open();
    fireEvent.press(screen.getByTestId("account-menu-panel"));
    expect(onClose).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  it("names the account being signed out of", () => {
    open({ accountName: "Melchizedek Narh" });
    expect(screen.getByText("Melchizedek Narh")).toBeTruthy();
  });

  it("falls back to a session-shaped name when no screen supplies one", () => {
    open();
    expect(screen.getByText("Your account")).toBeTruthy();
  });

  it("renders without a SafeAreaProvider above it", () => {
    // REGRESSION. The first cut used `useSafeAreaInsets()`, which THROWS "No safe
    // area value available" with no provider — and because PatientShell mounts
    // this on every patient screen, that took out six FindCareScreen routing
    // cases in a DIFFERENT batch. A shell default must not impose a provider
    // requirement on the ~10 suites that render patient screens raw.
    renderBare(<AccountMenu visible onClose={onClose} />);
    expect(screen.getByLabelText("Profile")).toBeTruthy();
    expect(screen.getByLabelText("Sign out")).toBeTruthy();
  });

  it("renders nothing while closed", () => {
    render(<AccountMenu visible={false} onClose={onClose} />);
    expect(screen.queryByLabelText("Profile")).toBeNull();
    expect(screen.queryByLabelText("Sign out")).toBeNull();
  });
});

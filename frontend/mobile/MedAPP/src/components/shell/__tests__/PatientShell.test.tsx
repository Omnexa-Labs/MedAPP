// Locks the one-wrap contract: a screen that adopts PatientShell gets the
// canonical patient bar and the canonical patient tab set, and cannot end up with
// the practitioner layout (centred logo, back button, Schedule/Patients/Profile).

import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

const mockBack = jest.fn();
const mockReplace = jest.fn();
// `push` is mocked ONLY so the "must not push" assertion can be made. Nothing
// in the shell is allowed to call it.
const mockPush = jest.fn();
// The account menu's Profile item uses `navigate` (it dedupes when the profile
// screen is already in history). Mocked here so pressing it doesn't blow up on a
// missing router method.
const mockNavigate = jest.fn();
const mockNav = { canGoBack: true };

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
    canGoBack: () => mockNav.canGoBack,
  },
}));

// The shell now mounts <AccountMenu />, which reaches the auth store by DYNAMIC
// import at press time precisely so this suite (and ~9 others that render the
// shell) do NOT have to mock `@/lib/config`. The store is still mocked here so
// the sign-out assertion below observes a real call instead of a real
// SecureStore write.
const mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock("@/store/auth-store", () => ({
  useAuthStore: { getState: () => ({ signOut: mockSignOut }) },
}));

import { PatientShell, PATIENT_TAB_HREFS, SETTINGS_HREF } from "../PatientShell";

/** Every tab, with where it must go. Drives the table-driven cases below. */
const ALL_TABS = [
  ["home", "Home", "/(app)"],
  ["overview", "Overview", "/(app)/overview"],
  ["inbox", "Inbox", "/(app)/inbox"],
  ["community", "Community", "/(app)/community"],
  ["lifestyle", "Lifestyle", "/(app)/lifestyle"],
] as const;

describe("PatientShell", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
    mockPush.mockClear();
    mockNavigate.mockClear();
    mockSignOut.mockClear();
    mockNav.canGoBack = true;
  });

  it("renders the app bar, the body and the bottom nav", () => {
    render(
      <PatientShell>
        <Text>Body content</Text>
      </PatientShell>,
    );
    expect(screen.getByLabelText("MedApp")).toBeTruthy();
    expect(screen.getByLabelText("Your profile")).toBeTruthy();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    expect(screen.getByText("Body content")).toBeTruthy();
    expect(screen.getByLabelText("Home")).toBeTruthy();
  });

  it("renders the patient tab set, never the practitioner one", () => {
    render(
      <PatientShell>
        <Text>Body</Text>
      </PatientShell>,
    );
    for (const label of ["Home", "Overview", "Inbox", "Community", "Lifestyle"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    for (const label of ["Schedule", "Patients", "Profile"]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    // A tab root shows no back button, even though `canGoBack` is true here.
    expect(screen.queryByLabelText("Go back")).toBeNull();
  });

  it("marks the given tab active", () => {
    render(
      <PatientShell activeTab="community">
        <Text>Body</Text>
      </PatientShell>,
    );
    expect(screen.getByLabelText("Community").props.accessibilityState.selected).toBe(true);
  });

  it("lets a screen override the shared routing with its own onTabPress", () => {
    const onTabPress = jest.fn();
    render(
      <PatientShell activeTab="home" onTabPress={onTabPress}>
        <Text>Body</Text>
      </PatientShell>,
    );
    fireEvent.press(screen.getByLabelText("Overview"));
    expect(onTabPress).toHaveBeenCalledWith("overview");
    // The override REPLACES the default; it does not run alongside it.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // The shared tab map. This is the whole point of putting it here: six screens
  // each wrote their own switch and each covered a different subset — three of
  // five roots omitted `inbox`, FindCare covered two of five, PatientDashboard
  // passed no handler at all. One map, one set of tests.
  // ---------------------------------------------------------------------------

  it("routes every tab with NO onTabPress from the screen", () => {
    // Rendered from a tab root that is none of the tested tabs' own root, so
    // every one of the five is expected to navigate at least once below.
    for (const [, label, href] of ALL_TABS) {
      mockReplace.mockClear();
      // `isTabRoot={false}` so even the highlighted tab must navigate.
      const { unmount } = render(
        <PatientShell activeTab="home" isTabRoot={false}>
          <Text>Body</Text>
        </PatientShell>,
      );
      fireEvent.press(screen.getByLabelText(label));
      expect(mockReplace).toHaveBeenCalledWith(href);
      unmount();
    }
  });

  it("REPLACES rather than pushes — tab switching must not grow the back stack", () => {
    // The defect: `push`/`navigate` accumulate one stack entry per tab visited,
    // so Android hardware back walks Home -> Community -> Lifestyle -> ...
    // instead of leaving the app. `replace` keeps at most one tab root on the
    // stack. If someone reintroduces `push` here, this fails.
    render(
      <PatientShell activeTab="home">
        <Text>Body</Text>
      </PatientShell>,
    );
    fireEvent.press(screen.getByLabelText("Community"));

    expect(mockReplace).toHaveBeenCalledWith("/(app)/community");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("no-ops the active tab on a TAB ROOT", () => {
    render(
      <PatientShell activeTab="community">
        <Text>Body</Text>
      </PatientShell>,
    );
    fireEvent.press(screen.getByLabelText("Community"));
    expect(mockReplace).not.toHaveBeenCalled();

    // ...but its neighbours still work.
    fireEvent.press(screen.getByLabelText("Inbox"));
    expect(mockReplace).toHaveBeenCalledWith("/(app)/inbox");
  });

  it("still navigates the highlighted tab when the screen is NOT that tab's root", () => {
    // This used to name find-care / patient-dashboard / patient-profile-overview
    // as the callers. As of 2026-08-05 there are NONE: all three are DetailShell
    // screens, because the PO ruled that a screen outside the five tabs may not
    // wear the tab bar at all (docs/PIPELINE.md §5). See `isTabRoot`'s doc block.
    //
    // The assertion stays, and it is now guarding the prop rather than a screen:
    // while `isTabRoot={false}` remains part of the API, passing it must give
    // working tabs. A dead highlighted tab on a screen a user is trying to leave
    // is the failure it was written for, and it would come back silently.
    render(
      <PatientShell activeTab="home" isTabRoot={false}>
        <Text>Body</Text>
      </PatientShell>,
    );
    fireEvent.press(screen.getByLabelText("Home"));
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
  });

  it("exposes a map covering all five tabs and nothing else", () => {
    // A missing key here is a tab that silently does nothing — the exact bug
    // this round is fixing — and TypeScript alone cannot catch a key typo'd
    // into a wrong-but-valid route.
    expect(Object.keys(PATIENT_TAB_HREFS).sort()).toEqual([
      "community",
      "home",
      "inbox",
      "lifestyle",
      "overview",
    ]);
    for (const [key, , href] of ALL_TABS) {
      expect(PATIENT_TAB_HREFS[key]).toBe(href);
    }
  });

  // Was "passes the avatar and unread count through to the bar". The unread
  // half asserted a forward that no product caller ever exercised — this suite
  // was the ONLY thing in the codebase that ever passed `unreadCount`, which is
  // precisely why the dead prop survived. Both prop and badge are gone; see
  // PatientAppBar's header for what notification_service must expose first.
  it("passes the avatar through to the bar, and the bell claims no unread state", () => {
    render(
      <PatientShell avatarInitials="MN" avatarLabel="Melchizedek Narh">
        <Text>Body</Text>
      </PatientShell>,
    );
    expect(screen.getByText("MN")).toBeTruthy();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    expect(screen.queryByLabelText(/unread/i)).toBeNull();
  });

  it("suppresses the bottom nav for a detail screen but keeps the bar", () => {
    render(
      <PatientShell showBottomNav={false}>
        <Text>Body</Text>
      </PatientShell>,
    );
    expect(screen.queryByLabelText("Overview")).toBeNull();
    expect(screen.getByLabelText("MedApp")).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Back — these exist because the shell has already shipped a dropped prop once
  // (PractitionerShell declared `onTabPress` and never forwarded it). A prop the
  // shell accepts but swallows is worse than one it doesn't have: the caller
  // reads as correct.
  // ---------------------------------------------------------------------------

  it("forwards hideBack={false} to the bar", () => {
    render(
      <PatientShell hideBack={false}>
        <Text>Body</Text>
      </PatientShell>,
    );
    expect(screen.getByLabelText("Go back")).toBeTruthy();
  });

  it("forwards onBackPress to the bar", () => {
    const onBackPress = jest.fn();
    render(
      <PatientShell hideBack={false} onBackPress={onBackPress}>
        <Text>Body</Text>
      </PatientShell>,
    );
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(onBackPress).toHaveBeenCalled();
  });

  it("forwards backFallbackHref to the bar", () => {
    mockNav.canGoBack = false;
    render(
      <PatientShell hideBack={false} backFallbackHref={"/(app)/index" as never}>
        <Text>Body</Text>
      </PatientShell>,
    );
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockReplace).toHaveBeenCalledWith("/(app)/index");
  });

  it("gives a pushed detail screen back AND no bottom nav", () => {
    // docs/BRAND.md §App shell, both halves of one sentence.
    render(
      <PatientShell hideBack={false} showBottomNav={false}>
        <Text>Body</Text>
      </PatientShell>,
    );
    expect(screen.getByLabelText("Go back")).toBeTruthy();
    expect(screen.queryByLabelText("Overview")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // THE AVATAR — a SHELL default, still, but it now NAVIGATES
  //
  // Same reasoning as the tab map above, and the same evidence: `onAvatarPress`
  // was plumbed shell -> bar and NO screen passed it, so the avatar was a dead
  // 44pt control on all 12 patient screens. Per-screen wiring is how the Inbox
  // tab went missing from three roots. These cases lock the default in place so
  // a screen cannot omit it and so nobody "tidies" it back out into the screens.
  //
  // WHAT CHANGED: the destination used to be an <AccountMenu /> popover mounted
  // by this shell. It is now the Settings SCREEN — the component flagged its own
  // 320dp panel as reading like a menu at 393dp and a sheet at 360dp, and the PO
  // ruled it a full page. The popover assertions below became navigation
  // assertions; the sign-out and appearance COVERAGE moved with the behaviour to
  // SettingsScreen's own suite, which is where those controls now live.
  // ---------------------------------------------------------------------------

  it("opens Settings from the avatar with no screen wiring at all", () => {
    render(
      <PatientShell>
        <Text>Body</Text>
      </PatientShell>,
    );
    fireEvent.press(screen.getByRole("button", { name: "Your profile" }));
    expect(mockNavigate).toHaveBeenCalledWith(SETTINGS_HREF);
    expect(mockNavigate).toHaveBeenCalledWith("/(app)/settings");
  });

  it("navigates rather than pushes, so a double tap cannot stack two Settings", () => {
    render(
      <PatientShell>
        <Text>Body</Text>
      </PatientShell>,
    );
    fireEvent.press(screen.getByRole("button", { name: "Your profile" }));
    fireEvent.press(screen.getByRole("button", { name: "Your profile" }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("no longer mounts the account popover, or announces the avatar as a disclosure", () => {
    // The avatar opens a SCREEN now. Announcing `expanded` for it would be a
    // false disclosure, and the menu must not be in the tree at all — a mounted
    // second sign-out path is exactly what this change removes.
    render(
      <PatientShell>
        <Text>Body</Text>
      </PatientShell>,
    );
    const avatar = screen.getByRole("button", { name: "Your profile" });
    // `expanded` specifically — Pressable always normalises accessibilityState
    // into a five-key object, so the object itself is never undefined.
    expect(avatar.props.accessibilityState.expanded).toBeUndefined();
    expect(screen.queryByLabelText("Sign out")).toBeNull();
    expect(screen.queryByLabelText("Appearance")).toBeNull();
  });

  it("yields the avatar to a screen that really does override it", () => {
    // The escape hatch stays open (a screen may have a genuine reason), and when
    // it is used the shell must not also navigate.
    const onAvatarPress = jest.fn();
    render(
      <PatientShell onAvatarPress={onAvatarPress}>
        <Text>Body</Text>
      </PatientShell>,
    );
    fireEvent.press(screen.getByRole("button", { name: "Your profile" }));
    expect(onAvatarPress).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("keeps the avatar working on a detail screen that has no bottom nav", () => {
    // A pushed screen loses the tab bar, not its account. Patient Profile
    // Overview is exactly this shape.
    render(
      <PatientShell showBottomNav={false} hideBack={false}>
        <Text>Body</Text>
      </PatientShell>,
    );
    fireEvent.press(screen.getByRole("button", { name: "Your profile" }));
    expect(mockNavigate).toHaveBeenCalledWith(SETTINGS_HREF);
  });
});

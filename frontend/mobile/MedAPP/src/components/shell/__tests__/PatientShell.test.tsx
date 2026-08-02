// Locks the one-wrap contract: a screen that adopts PatientShell gets the
// canonical patient bar and the canonical patient tab set, and cannot end up with
// the practitioner layout (centred logo, back button, Schedule/Patients/Profile).

import { screen, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

const mockBack = jest.fn();
const mockReplace = jest.fn();
// `push` is mocked ONLY so the "must not push" assertion can be made. Nothing
// in the shell is allowed to call it.
const mockPush = jest.fn();
const mockNav = { canGoBack: true };

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: () => mockNav.canGoBack,
  },
}));

import { PatientShell, PATIENT_TAB_HREFS } from "../PatientShell";

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
    // find-care / patient-dashboard / patient-profile-overview all render
    // `activeTab="home"` while being pushed screens. If the shell treated the
    // highlight as "you are already here", Home would be a dead button on
    // exactly the screens a user most needs to leave.
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

  it("passes the avatar and unread count through to the bar", () => {
    render(
      <PatientShell avatarInitials="MN" avatarLabel="Melchizedek Narh" unreadCount={7}>
        <Text>Body</Text>
      </PatientShell>,
    );
    expect(screen.getByText("MN")).toBeTruthy();
    expect(screen.getByLabelText("Notifications, 7 unread")).toBeTruthy();
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
});

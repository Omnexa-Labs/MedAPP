// SettingsScreen — the coverage that used to live in PatientShell.test.tsx.
//
// When the avatar stopped opening a popover and started opening this screen,
// three assertions had to move with the behaviour rather than be deleted: that
// sign-out is REACHABLE at all (it was unreachable from anywhere in the app
// before the account menu existed), that it is CONFIRMED, and that the profile
// route is not orphaned. All three are here.

import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    push: (...a: unknown[]) => mockPush(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
    navigate: (...a: unknown[]) => mockNavigate(...a),
    canGoBack: () => true,
  },
}));

// `AccountMenu` reaches the auth store by DYNAMIC import at press time. Mocked
// so the sign-out assertion observes a real call rather than a SecureStore write.
const mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock("@/store/auth-store", () => ({
  useAuthStore: { getState: () => ({ signOut: mockSignOut }) },
}));

const mockUser: { displayName?: string; avatarUrl?: string | null } | null = {
  displayName: "Melchizedek Narh",
  avatarUrl: null,
};
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => mockUser,
}));

import { SettingsScreen } from "../SettingsScreen";

describe("SettingsScreen", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockNavigate.mockClear();
    mockPush.mockClear();
    mockSignOut.mockClear();
  });

  it("shows whose account this is, so sign-out names a session", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("Melchizedek Narh")).toBeTruthy();
  });

  it("un-orphans the profile route from the identity card", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText("Melchizedek Narh. View and edit your profile"));
    expect(mockNavigate).toHaveBeenCalledWith("/(app)/patient-profile-overview");
  });

  it("gives the appearance control a home the user can actually reach", () => {
    // The whole reason the control was surfaced in the first place: before the
    // account menu, <AppearanceSelector /> was referenced by nothing but the
    // barrel export.
    render(<SettingsScreen />);
    expect(screen.getByLabelText("Light")).toBeTruthy();
    expect(screen.getByLabelText("Dark")).toBeTruthy();
    expect(screen.getByLabelText("System")).toBeTruthy();
  });

  it("makes signing out reachable — and confirms before doing it", async () => {
    render(<SettingsScreen />);
    // The row does NOT sign out on its own. That is the second of the two
    // guards, and it is the one that matters: signOut() clears both tokens and
    // the recovery is re-authenticating, not an undo.
    fireEvent.press(screen.getByLabelText("Sign out"));
    expect(mockSignOut).not.toHaveBeenCalled();

    // The confirm dialog's own destructive button carries the same label.
    const confirm = screen.getAllByLabelText("Sign out");
    fireEvent.press(confirm[confirm.length - 1]);
    expect(mockReplace).toHaveBeenCalledWith("/(public)/sign-in");
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it("lets the user back out of the confirmation without losing the session", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText("Sign out"));
    fireEvent.press(screen.getByLabelText("Stay signed in"));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("cancelling CLOSES the sheet — it does not reveal the account popover", () => {
    // Regression, caught on device. `AccountMenu`'s cancel used to hardcode
    // setView("menu"), which is only right for a caller that arrived FROM the
    // menu. Here it dropped a full account popover — its own identity row, a
    // duplicate Appearance control and a second Sign out — on top of Settings.
    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText("Sign out"));
    fireEvent.press(screen.getByLabelText("Stay signed in"));

    // Exactly one "Sign out" left: this screen's own row. Two would mean the
    // popover is still mounted over it.
    expect(screen.getAllByLabelText("Sign out")).toHaveLength(1);
    // And the confirmation itself is gone.
    expect(screen.queryByLabelText("Stay signed in")).toBeNull();
  });

  it("carries no trailing app-bar action — there is nothing here to share", () => {
    // The Figma frame hides Detail AppBar's action slot. An icon that looks live
    // and does nothing is the defect the tooltip pass existed to remove.
    render(<SettingsScreen />);
    expect(screen.queryByLabelText("Share")).toBeNull();
  });
});

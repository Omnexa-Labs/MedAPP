import { fireEvent, screen } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { SecurityPrivacyScreen } from "../SecurityPrivacyScreen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    canGoBack: () => true,
    back: jest.fn(),
  },
}));
jest.mock("@/features/auth/api", () => ({ authApi: { changePassword: jest.fn() } }));
jest.mock("../BiometricSettingsCard", () => ({ BiometricSettingsCard: () => null }));
jest.mock("@/store/auth-store", () => ({ useAuthStore: { getState: jest.fn() } }));
jest.mock("@/features/auth/hooks/use-biometric-login", () => ({
  useBiometricCapability: () => ({
    ready: true,
    deviceCapable: false,
    kinds: [],
    hasEnrolledCredential: false,
  }),
}));

test("security settings opens session management and removes the unavailable claim", () => {
  render(<SecurityPrivacyScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Manage active sessions" }));
  expect(mockPush).toHaveBeenCalledWith("/(app)/active-sessions");
  expect(screen.queryByText(/Signing out other devices is not available yet/)).toBeNull();
});

test("security settings opens care-team consent management", () => {
  render(<SecurityPrivacyScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Manage care-team sharing" }));
  expect(mockPush).toHaveBeenCalledWith("/(app)/care-team-sharing");
});

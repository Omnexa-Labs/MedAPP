import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { SecurityPrivacyScreen } from "../SecurityPrivacyScreen";
import { ApiError } from "@/types/api";
jest.setTimeout(90_000);
const mockChange = jest.fn();
const mockSignOut = jest.fn(async () => {});
const mockReplace = jest.fn();
jest.mock("../BiometricSettingsCard", () => ({ BiometricSettingsCard: () => null }));
jest.mock("@/features/auth/api", () => ({
  authApi: { changePassword: (...args: unknown[]) => mockChange(...args) },
}));
jest.mock("@/store/auth-store", () => ({
  useAuthStore: { getState: () => ({ signOut: mockSignOut, isAuthenticated: false }) },
}));
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: jest.fn(),
    canGoBack: () => true,
    back: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockChange.mockReset().mockResolvedValue(undefined);
});
function fill() {
  fireEvent.changeText(screen.getByTestId("security-current-password"), "CurrentPassword123!");
  fireEvent.changeText(screen.getByTestId("security-new-password"), "NewPassword456!");
  fireEvent.changeText(screen.getByTestId("security-confirm-password"), "NewPassword456!");
}

test("success removes password fields and offers sign-in that clears the old device session", async () => {
  render(<SecurityPrivacyScreen />);
  fill();
  await act(async () => {
    fireEvent.press(screen.getByTestId("security-submit-password"));
  });
  expect(screen.getByText(/Your password has been changed/)).toBeTruthy();
  expect(screen.queryByTestId("security-current-password")).toBeNull();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Sign in again" }));
  });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith("/(public)/sign-in");
});

test("server rejection preserves editable input and retry without a success claim", async () => {
  mockChange.mockRejectedValueOnce(new ApiError("current password incorrect", 400));
  render(<SecurityPrivacyScreen />);
  fill();
  await act(async () => {
    fireEvent.press(screen.getByTestId("security-submit-password"));
  });
  expect(screen.getByText("current password incorrect")).toBeTruthy();
  expect(screen.getByTestId("security-current-password").props.editable).toBe(true);
  expect(mockSignOut).not.toHaveBeenCalled();
});

test("duplicate submission cannot issue two password changes", async () => {
  let resolve!: () => void;
  mockChange.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render(<SecurityPrivacyScreen />);
  fill();
  fireEvent.press(screen.getByTestId("security-submit-password"));
  fireEvent.press(screen.getByTestId("security-submit-password"));
  expect(mockChange).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("security-current-password").props.editable).toBe(false);
  await act(async () => resolve());
  await waitFor(() => expect(screen.getByText(/Your password has been changed/)).toBeTruthy());
});

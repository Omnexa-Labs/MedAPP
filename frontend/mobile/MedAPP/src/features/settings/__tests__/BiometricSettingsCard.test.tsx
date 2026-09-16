import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { BiometricSettingsCard } from "../BiometricSettingsCard";

jest.setTimeout(90_000);
const mockReplace = jest.fn();
const mockEnable = jest.fn();
const mockDisable = jest.fn();
const mockLock = jest.fn();
let mockAuthenticated = true;
const mockRefresh = jest.fn(async () => {});
let mockCapability = {
  ready: true,
  deviceCapable: true,
  ownerId: null as string | null,
  failed: false,
  refresh: mockRefresh,
};
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));
jest.mock("@/hooks/use-current-user", () => ({ useCurrentUser: () => ({ id: "patient" }) }));
jest.mock("@/features/auth/hooks/use-biometric-login", () => ({
  useBiometricCapability: () => mockCapability,
}));
jest.mock("@/lib/storage/secure-storage", () => ({
  BiometricStorageError: class extends Error {},
}));
jest.mock("@/store/auth-store", () => ({
  AuthSessionChanged: class extends Error {},
  useAuthStore: {
    getState: () => ({
      enableBiometrics: mockEnable,
      disableBiometrics: mockDisable,
      lock: mockLock,
      isAuthenticated: mockAuthenticated,
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthenticated = true;
  mockCapability = {
    ready: true,
    deviceCapable: true,
    ownerId: null,
    failed: false,
    refresh: mockRefresh,
  };
  mockEnable.mockImplementation(async () => {
    mockCapability.ownerId = "patient";
  });
  mockDisable.mockImplementation(async () => {
    mockCapability.ownerId = null;
  });
  mockLock.mockImplementation(async () => {
    mockAuthenticated = false;
  });
});

test("capability alone stays Off and enabling requires confirmation and a successful operation", async () => {
  render(<BiometricSettingsCard />);
  expect(screen.getByText("Off")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Enable biometric sign-in" }));
  expect(mockEnable).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Confirm enable" }));
  });
  await waitFor(() => expect(screen.getByText("Enabled")).toBeTruthy());
  expect(mockEnable).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Biometric sign-in is enabled on this device.")).toBeTruthy();
});

test("cancelling setup never enrolls the device", () => {
  render(<BiometricSettingsCard />);
  fireEvent.press(screen.getByRole("button", { name: "Enable biometric sign-in" }));
  fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(mockEnable).not.toHaveBeenCalled();
  expect(screen.getByText("Off")).toBeTruthy();
});

test("a failed setup stays Off and can be retried without a false success notice", async () => {
  mockEnable.mockRejectedValueOnce(new Error("keychain unavailable"));
  render(<BiometricSettingsCard />);
  fireEvent.press(screen.getByRole("button", { name: "Enable biometric sign-in" }));
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Confirm enable" }));
  });
  expect(screen.getByText(/Couldn't change biometric sign-in/)).toBeTruthy();
  expect(screen.getByText("Off")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Confirm enable" }));
  });
  await waitFor(() => expect(screen.getByText("Enabled")).toBeTruthy());
});

test("turning off requires confirmation and retains the current account session", async () => {
  mockCapability.ownerId = "patient";
  render(<BiometricSettingsCard />);
  fireEvent.press(screen.getByRole("button", { name: "Turn off biometric sign-in" }));
  expect(mockDisable).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Confirm turn off" }));
  });
  expect(screen.getByText("Off")).toBeTruthy();
  expect(mockAuthenticated).toBe(true);
});

test("unsupported devices show an explanation without an enrollment action", () => {
  mockCapability.deviceCapable = false;
  render(<BiometricSettingsCard />);
  expect(screen.getByText(/isn't available on this device/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Enable biometric sign-in" })).toBeNull();
});

test("lock returns to sign-in after the account becomes inaccessible", async () => {
  mockCapability.ownerId = "patient";
  render(<BiometricSettingsCard />);
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Lock MedApp" }));
  });
  expect(mockLock).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith("/(public)/sign-in");
});

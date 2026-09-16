import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { TwoFactorSettingsScreen } from "../TwoFactorSettingsScreen";
import { ApiError } from "@/types/api";

jest.setTimeout(90_000);
const mockStatus = jest.fn();
const mockSetup = jest.fn();
const mockConfirm = jest.fn();
const mockDisable = jest.fn();
const mockRegenerate = jest.fn();
const mockSignOut = jest.fn();
const mockReplace = jest.fn();
let mockRevision = 1;
let mockAuthenticated = true;
jest.mock("expo-router", () => ({
  router: {
    canGoBack: () => true,
    back: jest.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));
jest.mock("../two-factor-api", () => ({
  twoFactorApi: () => ({
    status: mockStatus,
    setup: mockSetup,
    confirm: mockConfirm,
    disable: mockDisable,
    regenerate: mockRegenerate,
  }),
}));
jest.mock("@/store/auth-store", () => ({
  useAuthStore: Object.assign(
    (selector: (s: { revision: number }) => unknown) => selector({ revision: mockRevision }),
    {
      getState: () => ({
        revision: mockRevision,
        isAuthenticated: mockAuthenticated,
        signOut: mockSignOut,
      }),
    },
  ),
}));
const off = {
  enabled: false,
  available: true,
  recovery_codes_remaining: 0,
  sign_out_delay_seconds: 900,
};
const draft = {
  setup_id: "setup",
  secret: "SETUPKEY",
  provisioning_uri: "otpauth://totp/MedApp?secret=SETUPKEY",
  recovery_codes: ["ABCDE-12345-ABCDE-12345"],
  expires_in: 600,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRevision = 1;
  mockAuthenticated = true;
  mockStatus.mockResolvedValue(off);
  mockSetup.mockResolvedValue(draft);
  mockConfirm.mockResolvedValue(undefined);
  mockDisable.mockResolvedValue(undefined);
  mockSignOut.mockImplementation(async () => {
    mockAuthenticated = false;
  });
});
async function begin() {
  render(<TwoFactorSettingsScreen />);
  await waitFor(() => expect(screen.getByText("Off")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: "Set up authenticator" }));
  fireEvent.changeText(screen.getByLabelText("Current password"), "Password123!");
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Continue setup" })));
}
test("setup does not enable until recovery codes are acknowledged and authenticator verified", async () => {
  await begin();
  expect(mockSetup).toHaveBeenCalledWith("Password123!");
  expect(screen.getByText("Off")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Enable and sign out" })).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText("Six-digit authenticator code"), "123456");
  fireEvent.press(
    screen.getByRole("checkbox", { name: "I have saved my recovery codes somewhere safe" }),
  );
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Enable and sign out" })),
  );
  expect(mockConfirm).toHaveBeenCalledWith("setup", "123456");
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith("/(public)/sign-in");
});
test("cancel clears setup secrets and never enables", async () => {
  await begin();
  fireEvent.press(screen.getByRole("button", { name: "Cancel setup" }));
  expect(screen.queryByTestId("two-factor-setup-secret")).toBeNull();
  expect(mockConfirm).not.toHaveBeenCalled();
});
test("unavailable server key keeps setup unavailable with a retryable status error", async () => {
  mockStatus
    .mockRejectedValueOnce(new ApiError("offline", 0))
    .mockResolvedValue({ ...off, available: false });
  render(<TwoFactorSettingsScreen />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Check status again" })).toBeTruthy(),
  );
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Check status again" })),
  );
  expect(screen.getByRole("button", { name: "Set up authenticator" })).toBeDisabled();
});
test("lost enable response checks actual status before signing out", async () => {
  mockConfirm.mockRejectedValue(new ApiError("offline", 0));
  await begin();
  fireEvent.press(
    screen.getByRole("checkbox", { name: "I have saved my recovery codes somewhere safe" }),
  );
  fireEvent.changeText(screen.getByLabelText("Six-digit authenticator code"), "123456");
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Enable and sign out" })),
  );
  expect(mockSignOut).not.toHaveBeenCalled();
  mockStatus.mockResolvedValue({ ...off, enabled: true, recovery_codes_remaining: 10 });
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Check status again" })),
  );
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});
test("disable requires explicit password and code confirmation", async () => {
  mockStatus.mockResolvedValue({ ...off, enabled: true, recovery_codes_remaining: 8 });
  render(<TwoFactorSettingsScreen />);
  await waitFor(() => expect(screen.getByText("On")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: "Turn off two-factor authentication" }));
  expect(mockDisable).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText("Current password"), "Password123!");
  fireEvent.changeText(screen.getByLabelText("Authenticator or recovery code"), "123456");
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Confirm turn off" })));
  expect(mockDisable).toHaveBeenCalledWith("Password123!", "123456");
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});
test("replacement codes are displayed before the sign-in acknowledgement", async () => {
  mockStatus.mockResolvedValue({ ...off, enabled: true, recovery_codes_remaining: 2 });
  mockRegenerate.mockResolvedValue({ recovery_codes: ["NEW12-34567-ABCDE-12345"] });
  render(<TwoFactorSettingsScreen />);
  await waitFor(() => expect(screen.getByText("On")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: "Replace recovery codes" }));
  fireEvent.changeText(screen.getByLabelText("Current password"), "Password123!");
  fireEvent.changeText(screen.getByLabelText("Authenticator or recovery code"), "123456");
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Confirm replacement" })),
  );
  expect(screen.getByText("NEW12-34567-ABCDE-12345")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign in again" })).toBeDisabled();
  expect(mockSignOut).not.toHaveBeenCalled();
});
test("a late setup response after account change never reveals its secret", async () => {
  mockSetup.mockImplementation(async () => {
    mockRevision++;
    return draft;
  });
  await begin();
  expect(screen.queryByTestId("two-factor-setup-secret")).toBeNull();
});

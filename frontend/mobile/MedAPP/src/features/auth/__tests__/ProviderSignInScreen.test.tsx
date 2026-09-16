import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { ProviderSignInScreen } from "../ProviderSignInScreen";
import { providerApi } from "../provider-api";
import { loadNativeProviders, ProviderCancelled } from "../native-providers";
import { authApi, TwoFactorRequired } from "../api";
import { useSignUpDraft } from "../hooks/use-signup-draft";
import { ApiError } from "@/types/api";

jest.setTimeout(90_000);
let mockRevision = 0;
const mockSignIn = jest.fn();
const mockReplace = jest.fn();
const authenticate = jest.fn();
jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn(), post: jest.fn() } }));
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));
jest.mock("../provider-api", () => ({
  providerApi: { config: jest.fn(), begin: jest.fn(), complete: jest.fn(), link: jest.fn() },
}));
jest.mock("../native-providers", () => ({
  loadNativeProviders: jest.fn(),
  ProviderCancelled: class extends Error {},
}));
jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  authApi: { signOut: jest.fn() },
}));
jest.mock("../TwoFactorSignIn", () => ({
  TwoFactorSignIn: () => {
    const { Text } = require("react-native");
    return <Text>Existing two-factor flow</Text>;
  },
}));
jest.mock("@/store/auth-store", () => ({
  useAuthStore: {
    getState: () => ({
      revision: mockRevision,
      isAuthenticated: false,
      signIn: mockSignIn,
    }),
  },
}));
const api = jest.mocked(providerApi);
const result = { accessToken: "access", refreshToken: "refresh", user: { id: "patient" } };
const draft = {
  action: "signup_required" as const,
  ticket: "proof",
  provider: "google" as const,
  email: "patient@example.com",
  display_name: "Ama Mensah",
  expires_in: 1200,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRevision = 0;
  useSignUpDraft.getState().reset();
  api.config.mockResolvedValue({ google: true, apple: false });
  api.begin.mockResolvedValue({ challenge_token: "challenge", nonce: "nonce", expires_in: 300 });
  authenticate.mockResolvedValue("signed-id-token");
  api.complete.mockResolvedValue(result as never);
  mockSignIn.mockResolvedValue(undefined);
  jest.mocked(authApi.signOut).mockResolvedValue(undefined);
  jest.mocked(loadNativeProviders).mockResolvedValue({
    google: {
      authenticate,
      Button: ({ onPress, disabled }) => {
        const { Pressable, Text } = require("react-native");
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            disabled={disabled}
            onPress={onPress}
          >
            <Text>Google native</Text>
          </Pressable>
        );
      },
    },
  });
});
async function ready() {
  render(<ProviderSignInScreen />);
  await screen.findByRole("button", { name: "Continue with Google" });
}
async function choose() {
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Continue with Google" })),
  );
}

test("unconfigured providers give an honest fallback without starting native authentication", async () => {
  api.config.mockResolvedValue({ google: false, apple: false });
  render(<ProviderSignInScreen />);
  await screen.findByText(
    "Google sign-in isn't available in this app yet. Use email and password.",
  );
  expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Use email sign-in" }));
  expect(mockReplace).toHaveBeenCalledWith("/(public)/sign-in");
  expect(api.begin).not.toHaveBeenCalled();
});
test("configuration failure can be retried", async () => {
  api.config.mockRejectedValueOnce(new Error("offline"));
  render(<ProviderSignInScreen />);
  await screen.findByText("Couldn't check sign-in options. Check your connection and retry.");
  fireEvent.press(screen.getByRole("button", { name: "Retry sign-in options" }));
  await screen.findByRole("button", { name: "Continue with Google" });
  expect(api.config).toHaveBeenCalledTimes(2);
});
test("server nonce and native proof are exchanged before installing a session", async () => {
  await ready();
  await choose();
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith("access", result.user, "refresh"));
  expect(authenticate).toHaveBeenCalledWith("nonce");
  expect(api.complete).toHaveBeenCalledWith("challenge", "signed-id-token");
});
test("canceling native authentication is silent and does not exchange a proof", async () => {
  authenticate.mockRejectedValueOnce(new ProviderCancelled());
  await ready();
  await choose();
  await waitFor(() => expect(screen.queryByText("Completing sign-in…")).toBeNull());
  expect(api.complete).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
});
test("signup keeps the proof in memory and sends the patient into email verification setup", async () => {
  api.complete.mockResolvedValue(draft);
  await ready();
  await choose();
  fireEvent.press(await screen.findByRole("button", { name: "Continue to account setup" }));
  expect(useSignUpDraft.getState().provider).toMatchObject({
    ticket: "proof",
    email: draft.email,
    fullName: "Ama Mensah",
  });
  expect(useSignUpDraft.getState().step1).toBeNull();
  expect(mockSignIn).not.toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith("/(public)/sign-up");
});
test("existing account linking asks for password and two-factor proof; failure clears secrets", async () => {
  api.complete.mockResolvedValue({ ...draft, action: "link_required", two_factor_required: true });
  api.link.mockRejectedValueOnce(new ApiError("Incorrect code", 400));
  await ready();
  await choose();
  await screen.findByLabelText("MedApp password");
  fireEvent.changeText(screen.getByLabelText("MedApp password"), "Password123!");
  fireEvent.changeText(screen.getByLabelText("Authenticator or recovery code"), "123456");
  fireEvent.press(screen.getByRole("button", { name: "Connect account and sign in" }));
  await screen.findByText("Incorrect code");
  expect(api.link).toHaveBeenCalledWith("proof", "Password123!", "123456");
  expect(screen.getByLabelText("MedApp password").props.value).toBe("");
  expect(mockSignIn).not.toHaveBeenCalled();
});
test("linked account challenges use the existing two-factor flow", async () => {
  api.complete.mockRejectedValue(new TwoFactorRequired("factor-proof", 300));
  await ready();
  await choose();
  await screen.findByText("Existing two-factor flow");
  expect(mockSignIn).not.toHaveBeenCalled();
});
test("late completion after account change is revoked instead of replacing the account", async () => {
  let resolve!: (value: unknown) => void;
  api.complete.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }) as never,
  );
  await ready();
  await choose();
  await waitFor(() => expect(api.complete).toHaveBeenCalled());
  mockRevision++;
  await act(async () => resolve(result));
  expect(mockSignIn).not.toHaveBeenCalled();
  expect(authApi.signOut).toHaveBeenCalledWith("refresh");
});

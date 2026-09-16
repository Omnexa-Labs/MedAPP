import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { ConnectedAccountsScreen } from "../ConnectedAccountsScreen";
import { providerApi } from "@/features/auth/provider-api";
import { ApiError } from "@/types/api";

jest.setTimeout(90_000);
const mockSignOut = jest.fn();
const mockReplace = jest.fn();
let mockCurrent = true;
jest.mock("expo-router", () => ({
  router: {
    canGoBack: () => true,
    back: jest.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));
jest.mock("@/features/auth/provider-api", () => ({
  providerApi: { connections: jest.fn(), disconnect: jest.fn() },
}));
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => ({ owner: "patient", revision: 1, isCurrent: () => mockCurrent }),
}));
jest.mock("@/store/auth-store", () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: false, signOut: mockSignOut }) },
}));
const api = jest.mocked(providerApi);
let query: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockCurrent = true;
  query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  api.connections.mockResolvedValue({
    items: [{ provider: "google", connected_at: "2026-09-13T12:00:00Z" }],
  });
  api.disconnect.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
});
afterEach(() => query.clear());
async function show() {
  render(
    <QueryClientProvider client={query}>
      <ConnectedAccountsScreen />
    </QueryClientProvider>,
  );
}
async function confirm() {
  await show();
  fireEvent.press(await screen.findByRole("button", { name: "Disconnect Google" }));
  fireEvent.changeText(screen.getByLabelText("Current MedApp password"), "Password123!");
  fireEvent.changeText(screen.getByLabelText("Authenticator or recovery code"), "123456");
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "Confirm disconnection" })),
  );
}
test("failed loading offers retry and empty state contains no invented connection", async () => {
  api.connections.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ items: [] });
  await show();
  fireEvent.press(await screen.findByRole("button", { name: "Retry" }));
  await screen.findByText(
    "No provider accounts are connected. You can sign in with email and password.",
  );
  expect(screen.queryByRole("button", { name: "Disconnect Google" })).toBeNull();
});
test("disconnect requires confirmation/proof and only signs out after success", async () => {
  await confirm();
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  expect(api.disconnect).toHaveBeenCalledWith("google", "Password123!", "123456", {
    isSessionCurrent: expect.any(Function),
  });
  expect(mockReplace).toHaveBeenCalledWith("/(public)/sign-in");
});
test("a rejected disconnect retains the connection and clears entered secrets", async () => {
  api.disconnect.mockRejectedValue(new ApiError("Incorrect proof", 400));
  await confirm();
  await screen.findByText("Incorrect proof");
  expect(screen.getByLabelText("Current MedApp password").props.value).toBe("");
  expect(screen.getByRole("button", { name: "Disconnect Google" })).toBeTruthy();
  expect(mockSignOut).not.toHaveBeenCalled();
});
test("an old disconnect completion does not sign out a replacement account", async () => {
  let resolve!: () => void;
  api.disconnect.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await confirm();
  await waitFor(() => expect(api.disconnect).toHaveBeenCalled());
  mockCurrent = false;
  await act(async () => resolve());
  expect(mockSignOut).not.toHaveBeenCalled();
});

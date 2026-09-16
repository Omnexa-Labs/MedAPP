import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { ApiError } from "@/types/api";
import { ActiveSessionsScreen } from "../ActiveSessionsScreen";
import { sessionsApi, type AccountSession, type SessionPage } from "../sessions-api";

// The first native render takes over 30 seconds on the Windows QA runtime.
jest.setTimeout(90_000);

const mockReplace = jest.fn();
const mockSignOut = jest.fn();
let mockSession = {
  user: { id: "patient" } as { id: string } | null,
  isAuthenticated: true,
  signOut: mockSignOut,
};
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    back: jest.fn(),
    canGoBack: () => true,
  },
}));
jest.mock("@/store/auth-store", () => ({ useAuthStore: { getState: () => mockSession } }));
jest.mock("@/hooks/use-current-user", () => ({ useCurrentUser: () => mockSession.user }));
jest.mock("../sessions-api", () => ({
  ...jest.requireActual("../sessions-api"),
  sessionsApi: { list: jest.fn(), revoke: jest.fn() },
}));
jest.mock("@/lib/api/client", () => ({ client: {} }));

const current: AccountSession = {
  id: "current",
  started_at: "2026-09-13T09:00:00Z",
  last_refreshed_at: "2026-09-13T10:00:00Z",
  expires_at: "2026-10-13T09:00:00Z",
  user_agent: "Android",
  ip_address: "192.0.2.1",
  is_current: true,
};
const other: AccountSession = {
  ...current,
  id: "other",
  user_agent: "Windows",
  ip_address: "192.0.2.2",
  is_current: false,
};
const page: SessionPage = {
  items: [current, other],
  next_offset: null,
  current_session_known: true,
  sign_out_delay_seconds: 900,
};

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ActiveSessionsScreen />
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { user: { id: "patient" }, isAuthenticated: true, signOut: mockSignOut };
  mockSignOut.mockImplementation(async () => {
    mockSession = { ...mockSession, user: null, isAuthenticated: false };
  });
  jest.mocked(sessionsApi.list).mockResolvedValue(page);
});

async function select(id: string) {
  await waitFor(() => expect(screen.getByTestId(`session-${id}`)).toBeTruthy());
  fireEvent.press(within(screen.getByTestId(`session-${id}`)).getByRole("button"));
}

test("shows real session metadata and requires confirmation before revocation", async () => {
  mount();
  await select("other");
  expect(screen.getByText("Current session")).toBeTruthy();
  expect(screen.getByText("IP address: 192.0.2.2")).toBeTruthy();
  expect(screen.getAllByText(/up to 15 minutes/).length).toBeGreaterThan(0);
  expect(sessionsApi.revoke).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Keep session" }));
  expect(sessionsApi.revoke).not.toHaveBeenCalled();
});

test("confirmed revocation removes the selected session and preserves this sign-in", async () => {
  jest.mocked(sessionsApi.revoke).mockResolvedValue({ current_session_revoked: false });
  jest
    .mocked(sessionsApi.list)
    .mockResolvedValueOnce(page)
    .mockResolvedValue({ ...page, items: [current] });
  mount();
  await select("other");
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Confirm sign out" }));
  });
  await waitFor(() => expect(sessionsApi.revoke).toHaveBeenCalledWith("other"));
  await waitFor(() => expect(screen.getByText(/^Session signed out\./)).toBeTruthy());
  await waitFor(() => expect(screen.queryByTestId("session-other")).toBeNull());
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(screen.getByTestId("session-current")).toBeTruthy();
});

test("current-session revocation clears local auth and returns to sign-in", async () => {
  jest.mocked(sessionsApi.revoke).mockResolvedValue({ current_session_revoked: true });
  mount();
  await select("current");
  fireEvent.press(screen.getByRole("button", { name: "Confirm sign out" }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/(public)/sign-in"));
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});

test("a failed revocation keeps the session and confirmation available for retry", async () => {
  jest
    .mocked(sessionsApi.revoke)
    .mockRejectedValueOnce(new ApiError("offline", 0))
    .mockResolvedValue({ current_session_revoked: false });
  mount();
  await select("other");
  fireEvent.press(screen.getByRole("button", { name: "Confirm sign out" }));
  await waitFor(() => expect(screen.getByText(/Check your connection and try again/)).toBeTruthy());
  expect(screen.getByTestId("session-other")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Confirm sign out" }));
  await waitFor(() => expect(sessionsApi.revoke).toHaveBeenCalledTimes(2));
});

test("pagination fetches remaining sessions and empty/error states can recover", async () => {
  jest
    .mocked(sessionsApi.list)
    .mockRejectedValueOnce(new ApiError("offline", 0))
    .mockResolvedValueOnce({ ...page, items: [current], next_offset: 25 })
    .mockResolvedValueOnce({ ...page, items: [other] });
  mount();
  await waitFor(() => expect(screen.getByText("Couldn't load your sessions")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.getByText("Load more sessions")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: "Load more sessions" }));
  await waitFor(() => expect(screen.getByTestId("session-other")).toBeTruthy());
  expect(sessionsApi.list).toHaveBeenCalledWith(25);
});

test("reports an empty list without inventing devices", async () => {
  jest.mocked(sessionsApi.list).mockResolvedValue({ ...page, items: [] });
  mount();
  await waitFor(() => expect(screen.getByText("No active sessions")).toBeTruthy());
  expect(screen.queryByTestId("session-current")).toBeNull();
});

test("a delayed current-session response cannot sign out a newly selected account", async () => {
  let resolve!: (value: { current_session_revoked: boolean }) => void;
  jest.mocked(sessionsApi.revoke).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  await select("current");
  fireEvent.press(screen.getByRole("button", { name: "Confirm sign out" }));
  fireEvent.press(screen.getByRole("button", { name: "Confirm sign out" }));
  expect(sessionsApi.revoke).toHaveBeenCalledTimes(1);
  mockSession = { ...mockSession, user: { id: "different-patient" } };
  await act(async () => resolve({ current_session_revoked: true }));
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

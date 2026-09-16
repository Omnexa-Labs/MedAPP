import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { render as baseRender } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TEST_METRICS } from "@/test/safe-area";
function SafeArea({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={TEST_METRICS}>{children}</SafeAreaProvider>;
}
const render = (ui: React.ReactElement) => baseRender(ui, { wrapper: SafeArea });
import { Platform } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { OnboardingStatusScreen } from "../OnboardingStatusScreen";
import { partnerApi, type PartnerApplication } from "../api";
import type { User } from "@/types/user";
import { consumeNativeOnboardingReturn, openOnboarding } from "@/lib/partner/open-onboarding";
import { authApi } from "@/features/auth/api";
import { refreshSession } from "@/lib/api/client";
const mockSetUser = jest.fn();
jest.mock("@/store/auth-store", () => ({
  useAuthStore: { getState: () => ({ setUser: mockSetUser, user: mockState.user }) },
}));
jest.mock("@/features/auth/api", () => ({ authApi: { me: jest.fn() } }));
jest.mock("@/lib/partner/open-onboarding", () => ({
  openOnboarding: jest.fn(),
  consumeWebOnboardingReturn: jest.fn(),
  consumeNativeOnboardingReturn: jest.fn(),
}));
const mockState: { user: User; revision: number } = {
  user: {
    id: "u1",
    email: "u1@example.test",
    displayName: "Ama",
    createdAt: "",
    accountRole: "user",
  },
  revision: 1,
};
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => {
    const owner = mockState.user.id;
    const revision = mockState.revision;
    const isCurrent = require("react").useCallback(
      () => mockState.user.id === owner && mockState.revision === revision,
      [owner, revision],
    );
    return {
      user: mockState.user,
      owner,
      revision: mockState.revision,
      isCurrent,
    };
  },
}));
jest.mock("@/lib/api/client", () => ({
  client: { get: jest.fn(), patch: jest.fn() },
  refreshSession: jest.fn(),
}));
jest.mock("../api", () => ({ partnerApi: { listApplications: jest.fn() } }));
jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    setParams: jest.fn(),
    canGoBack: () => true,
  },
}));
const list = jest.mocked(partnerApi.listApplications);
const application: PartnerApplication = {
  id: "a1",
  ownerId: "u1",
  partnerType: "practitioner",
  onboardingMode: null,
  legalName: "Ama Practice",
  displayName: null,
  specialty: null,
  status: "submitted",
  country: null,
  city: null,
  submittedAtIso: null,
  reviewedAtIso: null,
  rejectionReason: null,
};
let client: QueryClient;
const tree = () => (
  <QueryClientProvider client={client}>
    <OnboardingStatusScreen />
  </QueryClientProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, "OS", "ios");
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.mocked(consumeNativeOnboardingReturn).mockResolvedValue(false);
  mockState.user = { ...mockState.user, id: "u1", accountRole: "user" };
  mockState.revision = 1;
  jest.mocked(authApi.me).mockResolvedValue(mockState.user);
  jest.mocked(refreshSession).mockResolvedValue(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
it("opens the saved application and reloads real status after returning", async () => {
  list.mockResolvedValue([application]);
  jest.mocked(openOnboarding).mockResolvedValue("returned");
  render(tree());
  await screen.findByText("Ama Practice");
  fireEvent.press(screen.getByRole("button", { name: "View application on website" }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(openOnboarding).toHaveBeenCalledWith(
    expect.objectContaining({ applicationId: "a1", owner: "u1" }),
  );
  expect(authApi.me).toHaveBeenCalled();
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(mockSetUser).not.toHaveBeenCalled();
}, 15000);
it("shows handoff configuration failures without pretending to submit", async () => {
  list.mockResolvedValue([]);
  jest
    .mocked(openOnboarding)
    .mockRejectedValue(new Error("Professional onboarding handoff is not configured yet."));
  render(tree());
  await screen.findByText("No applications yet");
  fireEvent.press(screen.getByRole("button", { name: "Start professional application" }));
  expect(
    await screen.findByText("Professional onboarding handoff is not configured yet."),
  ).toBeTruthy();
  expect(screen.queryByText("Application submitted")).toBeNull();
});
it("renews the mobile JWT when the live account role changes on return", async () => {
  list.mockResolvedValue([]);
  jest.mocked(authApi.me).mockResolvedValue({ ...mockState.user, accountRole: "doctor" });
  jest.mocked(openOnboarding).mockResolvedValue("returned");
  render(tree());
  await screen.findByText("No applications yet");
  fireEvent.press(screen.getByRole("button", { name: "Start professional application" }));
  await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));
  expect(mockSetUser).not.toHaveBeenCalled();
});
afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});
it("renews permissions after a cold return even when hydration already loaded the new role", async () => {
  mockState.user = { ...mockState.user, accountRole: "doctor" };
  jest.mocked(authApi.me).mockResolvedValue(mockState.user);
  const state = "a".repeat(32);
  jest.mocked(useLocalSearchParams).mockReturnValue({ handoff_state: state });
  jest.mocked(consumeNativeOnboardingReturn).mockResolvedValue(true);
  list.mockResolvedValue([]);
  render(tree());
  await screen.findByText("No applications yet");
  let cleanup: void | (() => void);
  await act(async () => {
    cleanup = jest.mocked(useFocusEffect).mock.calls.at(-1)![0]();
  });
  await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ handoff_state: undefined }));
  expect(consumeNativeOnboardingReturn).toHaveBeenCalledWith("u1", state);
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(mockSetUser).not.toHaveBeenCalled();
  act(() => cleanup?.());
});
it("rejects an unmatched cold return and offers a server-backed manual refresh", async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ handoff_state: "b".repeat(32) });
  jest
    .mocked(consumeNativeOnboardingReturn)
    .mockRejectedValue(new Error("This return does not match your account."));
  list.mockResolvedValue([]);
  render(tree());
  await screen.findByText("No applications yet");
  let cleanup: void | (() => void);
  await act(async () => {
    cleanup = jest.mocked(useFocusEffect).mock.calls.at(-1)![0]();
  });
  expect(await screen.findByText("This return does not match your account.")).toBeTruthy();
  expect(refreshSession).not.toHaveBeenCalled();
  expect(mockSetUser).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Refresh application status" }));
  await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ handoff_state: undefined }));
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("This return does not match your account.")).toBeNull();
  act(() => cleanup?.());
});
it("does not renew or publish account data if the account changes during cold return validation", async () => {
  let resolveReturn!: (value: boolean) => void;
  jest.mocked(consumeNativeOnboardingReturn).mockReturnValue(
    new Promise((resolve) => {
      resolveReturn = resolve;
    }),
  );
  jest.mocked(useLocalSearchParams).mockReturnValue({ handoff_state: "c".repeat(32) });
  list.mockResolvedValue([]);
  render(tree());
  await screen.findByText("No applications yet");
  let cleanup: void | (() => void);
  act(() => {
    cleanup = jest.mocked(useFocusEffect).mock.calls.at(-1)![0]();
  });
  mockState.user = { ...mockState.user, id: "u2" };
  mockState.revision++;
  await act(async () => {
    resolveReturn(true);
  });
  expect(authApi.me).not.toHaveBeenCalled();
  expect(refreshSession).not.toHaveBeenCalled();
  expect(mockSetUser).not.toHaveBeenCalled();
  expect(router.setParams).not.toHaveBeenCalled();
  act(() => cleanup?.());
});
it("does not claim submission when no application exists", async () => {
  list.mockResolvedValue([]);
  render(tree());
  expect(await screen.findByText("No applications yet")).toBeTruthy();
  expect(screen.queryByText("Application submitted")).toBeNull();
  expect(screen.queryByRole("button", { name: "Open doctor workspace" })).toBeNull();
}, 15000);
it.each([
  ["draft", "Draft"],
  ["submitted", "Application submitted"],
  ["under_review", "Under review"],
  ["approved", "Application approved"],
  ["rejected", "Changes needed"],
  ["new-status", "Status unavailable"],
])("renders saved %s status", async (status, label) => {
  list.mockResolvedValue([{ ...application, status, rejectionReason: "License image unclear" }]);
  render(tree());
  expect(await screen.findByText(label)).toBeTruthy();
  if (status === "rejected") expect(screen.getByText("License image unclear")).toBeTruthy();
  else expect(screen.queryByText("License image unclear")).toBeNull();
  expect(screen.queryByRole("button", { name: "Open doctor workspace" })).toBeNull();
});
it("reports unknown status on failure and retries the actual request", async () => {
  list.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce([application]);
  render(tree());
  expect(await screen.findByText("Could not load application status")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Application submitted")).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(2);
});
it("does not render another owner's application, even in an admin response", async () => {
  list.mockResolvedValue([{ ...application, ownerId: "other" }]);
  render(tree());
  expect(await screen.findByText("No applications yet")).toBeTruthy();
  expect(screen.queryByText("Ama Practice")).toBeNull();
});
it("activated clinicians can reach their own guarded workspace and profile", async () => {
  mockState.user.accountRole = "doctor";
  list.mockResolvedValue([]);
  render(tree());
  await screen.findByText("No applications yet");
  fireEvent.press(screen.getByRole("button", { name: "Edit professional profile" }));
  expect(router.push).toHaveBeenCalledWith("/(app)/practitioner-profile");
  fireEvent.press(screen.getByRole("button", { name: "Open doctor workspace" }));
  expect(router.push).toHaveBeenCalledWith("/(app)/practitioner-home");
});
it("drops old application data when the account changes", async () => {
  list.mockResolvedValueOnce([application]).mockResolvedValueOnce([]);
  const view = render(tree());
  await screen.findByText("Ama Practice");
  const firstOptions = list.mock.calls[0][0]!;
  mockState.user = { ...mockState.user, id: "u2" };
  mockState.revision++;
  view.rerender(tree());
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("No applications yet")).toBeTruthy();
  expect(screen.queryByText("Ama Practice")).toBeNull();
  expect(firstOptions.isSessionCurrent!()).toBe(false);
});

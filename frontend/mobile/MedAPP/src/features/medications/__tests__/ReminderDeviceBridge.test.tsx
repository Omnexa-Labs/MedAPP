import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";
import { useAuthStore } from "@/store/auth-store";
import { ReminderDeviceBridge } from "../ReminderDeviceBridge";
import { renewReminderDevice, revokeReminderDevice } from "../reminder-device";
import { listenForReminders } from "../push-platform";

let mockAuth = {
  user: { id: "patient-a" } as { id: string } | null,
  token: "token-a" as string | null,
  revision: 1,
  isAuthenticated: true,
};
const mockUnsubscribe = jest.fn(),
  mockStop = jest.fn();
jest.mock("@/store/auth-store", () => ({
  useAuthStore: { getState: () => mockAuth, subscribe: jest.fn(() => mockUnsubscribe) },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../reminder-device", () => ({
  renewReminderDevice: jest.fn().mockResolvedValue(undefined),
  revokeReminderDevice: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../push-platform", () => ({ listenForReminders: jest.fn(() => mockStop) }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove: jest.fn() });
  mockAuth = { user: { id: "patient-a" }, token: "token-a", revision: 1, isAuthenticated: true };
});
afterEach(() => jest.restoreAllMocks());
it("uses rotated credentials on foreground and revokes the originating account on sign-out", () => {
  const events = jest.spyOn(AppState, "addEventListener");
  const view = render(<ReminderDeviceBridge />);
  const notify = jest.mocked(useAuthStore.subscribe).mock.calls[0][0];
  expect(renewReminderDevice).toHaveBeenCalledTimes(1);
  act(() => {
    mockAuth.token = "rotated-token";
    (notify as () => void)();
  });
  expect(revokeReminderDevice).not.toHaveBeenCalled();
  act(() => events.mock.calls[0][1]("active"));
  expect(renewReminderDevice).toHaveBeenLastCalledWith(
    expect.objectContaining({ owner: "patient-a", token: "rotated-token" }),
  );
  act(() => {
    mockAuth = { user: null, token: null, revision: 2, isAuthenticated: false };
    (notify as () => void)();
  });
  expect(revokeReminderDevice).toHaveBeenLastCalledWith(
    expect.objectContaining({ owner: "patient-a", token: "rotated-token" }),
  );
  expect(jest.mocked(listenForReminders).mock.calls[0][2]()).toBe(false);
  view.unmount();
  expect(mockUnsubscribe).toHaveBeenCalled();
  expect(mockStop).toHaveBeenCalled();
  events.mockRestore();
});
it("invalidates the old session when the signed-in account changes", () => {
  const view = render(<ReminderDeviceBridge />);
  const first = jest.mocked(renewReminderDevice).mock.calls[0][0];
  expect(first.current()).toBe(true);
  const notify = jest.mocked(useAuthStore.subscribe).mock.calls[0][0];
  act(() => {
    mockAuth = { user: { id: "patient-b" }, token: "token-b", revision: 2, isAuthenticated: true };
    (notify as () => void)();
  });
  expect(first.current()).toBe(false);
  expect(revokeReminderDevice).toHaveBeenCalledWith(
    expect.objectContaining({ owner: "patient-a", token: "token-a" }),
  );
  expect(renewReminderDevice).toHaveBeenLastCalledWith(
    expect.objectContaining({ owner: "patient-b", token: "token-b" }),
  );
  view.unmount();
});

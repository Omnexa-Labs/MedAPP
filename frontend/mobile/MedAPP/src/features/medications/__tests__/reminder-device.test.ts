import AsyncStorage from "@react-native-async-storage/async-storage";
import { client } from "@/lib/api/client";
import { pushToken, clearReminderNotifications } from "../push-platform";
import {
  enableReminderDevice,
  renewReminderDevice,
  revokeReminderDevice,
} from "../reminder-device";
jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn(), post: jest.fn() } }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("../push-platform", () => ({
  pushToken: jest.fn(),
  clearReminderNotifications: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "44444444-4444-4444-8444-444444444444" }));
const owner = "11111111-1111-4111-8111-111111111111";
const binding = "44444444-4444-4444-8444-444444444444";
let current = true;
const session = { owner, token: "captured-token", current: () => current };
const registered = {
  patient_user_id: owner,
  binding_id: binding,
  enabled: true,
  expires_at: "2026-09-24T12:00:00Z",
};
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  current = true;
  jest.mocked(client.get).mockResolvedValue({ push_available: true });
  jest.mocked(client.post).mockReset().mockResolvedValue(registered);
  jest.mocked(pushToken).mockReset().mockResolvedValue("ExpoPushToken[qa]");
});
it("does not prompt or register automatically before explicit opt-in", async () => {
  await renewReminderDevice(session);
  expect(pushToken).not.toHaveBeenCalled();
  expect(client.post).not.toHaveBeenCalled();
});
it("does not request permission when the server capability is unavailable", async () => {
  jest.mocked(client.get).mockResolvedValue({ push_available: false });
  await expect(enableReminderDevice(session)).rejects.toThrow("not been configured");
  expect(pushToken).not.toHaveBeenCalled();
});
it("does not register a device when permission is denied", async () => {
  jest.mocked(pushToken).mockResolvedValue(null);
  await expect(enableReminderDevice(session)).rejects.toThrow("not allowed");
  expect(client.post).not.toHaveBeenCalled();
});
it("reuses the saved binding after an uncertain registration and renews without prompting", async () => {
  jest.mocked(client.post).mockRejectedValueOnce(new Error("Lost response"));
  await expect(enableReminderDevice(session)).rejects.toThrow("Lost response");
  await enableReminderDevice(session);
  expect(jest.mocked(client.post).mock.calls[0][1]).toEqual(
    jest.mocked(client.post).mock.calls[1][1],
  );
  await renewReminderDevice(session);
  expect(pushToken).toHaveBeenLastCalledWith(false);
  expect(client.post).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.any(Object),
    expect.objectContaining({
      withAuth: false,
      headers: { Authorization: "Bearer captured-token" },
    }),
  );
});
it("disables a late registration with the captured account credential", async () => {
  jest.mocked(client.post).mockImplementationOnce(async () => {
    current = false;
    return registered;
  });
  await expect(enableReminderDevice(session)).rejects.toThrow("sign-in changed");
  expect(client.post).toHaveBeenLastCalledWith(
    expect.stringContaining(`/${owner}/medications/reminder-devices/${binding}/disable`),
    {},
    expect.objectContaining({
      withAuth: false,
      headers: { Authorization: "Bearer captured-token" },
    }),
  );
});
it("clears local opt-in on sign-out even when server revocation fails", async () => {
  await enableReminderDevice(session);
  jest.mocked(client.post).mockRejectedValueOnce(new Error("Offline"));
  await revokeReminderDevice(session);
  expect(clearReminderNotifications).toHaveBeenCalled();
  jest.mocked(pushToken).mockClear();
  await renewReminderDevice(session);
  expect(pushToken).not.toHaveBeenCalled();
});
it("does not renew another account's stored device binding", async () => {
  await enableReminderDevice(session);
  jest.mocked(client.post).mockClear();
  jest.mocked(pushToken).mockClear();
  await renewReminderDevice({ ...session, owner: "22222222-2222-4222-8222-222222222222" });
  expect(client.post).not.toHaveBeenCalled();
  expect(pushToken).not.toHaveBeenCalled();
});

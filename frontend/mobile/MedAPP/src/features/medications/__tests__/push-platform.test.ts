import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { pushToken, listenForReminders } from "../push-platform.native";
jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("expo-constants", () => ({
  appOwnership: "standalone",
  easConfig: { projectId: "qa-project" },
}));
jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: "ExpoPushToken[qa]" }),
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  clearLastNotificationResponseAsync: jest.fn().mockResolvedValue(undefined),
}));
beforeEach(() => {
  jest.clearAllMocks();
});
it("uses the configured project and asks permission only for explicit registration", async () => {
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ granted: false, canAskAgain: true } as never);
  expect(await pushToken(false)).toBeNull();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ granted: true } as never);
  expect(await pushToken(true)).toBe("ExpoPushToken[qa]");
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "qa-project" });
});
it("does not fabricate a token when native project configuration is missing", async () => {
  const previous = Constants.easConfig;
  Constants.easConfig = null;
  await expect(pushToken(true)).rejects.toThrow("not available in this app build");
  Constants.easConfig = previous;
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
});
it("opens the tracker once per tap and suppresses foreground alerts after sign-out", async () => {
  let signedIn = true;
  const open = jest.fn(),
    renew = jest.fn();
  const stop = listenForReminders(open, renew, () => signedIn);
  const response = {
    notification: {
      request: { identifier: "reminder-1", content: { data: { kind: "medication_reminder" } } },
    },
  } as never;
  const listener = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock
    .calls[0][0];
  listener(response);
  listener(response);
  expect(open).toHaveBeenCalledTimes(1);
  signedIn = false;
  const handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0][0]!;
  const behavior = await handler.handleNotification({
    request: { content: { data: { kind: "medication_reminder" } } },
  } as never);
  expect(behavior.shouldShowBanner).toBe(false);
  stop();
});

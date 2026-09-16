import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { client } from "@/lib/api/client";
import {
  consumeNativeOnboardingReturn,
  openOnboarding,
  validOnboardingReturn,
  validateOnboardingLink,
} from "../open-onboarding";
jest.mock("expo-crypto", () => ({ randomUUID: () => "11111111-1111-4111-8111-111111111111" }));
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
  dismissAuthSession: jest.fn(),
}));
jest.mock("@/lib/config", () => ({
  config: { appEnv: "dev", partnerOnboardingUrl: "http://localhost:3003" },
}));
jest.mock("@/lib/api/client", () => ({ client: { post: jest.fn(), delete: jest.fn() } }));
const proof = {
  handoff_id: "22222222-2222-4222-8222-222222222222",
  url: `http://localhost:3003/handoff#code=${"a".repeat(64)}`,
  expires_in: 120,
};
const state = "11111111111141118111111111111111";
const pendingKey = "medapp-partner-return";
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.replaceProperty(Platform, "OS", "ios");
  jest.mocked(client.post).mockResolvedValue(proof);
  jest.mocked(client.delete).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());
it("opens only the configured website with a code and validates the return state", async () => {
  jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
    type: "success",
    url: `medapp://onboarding-status?handoff_state=${state}`,
  } as WebBrowser.WebBrowserAuthSessionResult);
  await expect(openOnboarding({ owner: "user", isSessionCurrent: () => true })).resolves.toBe(
    "returned",
  );
  expect(client.post).toHaveBeenCalledWith(
    "/v1/auth/partner-handoffs",
    expect.objectContaining({ return_state: state, return_uri: "medapp://onboarding-status" }),
    expect.anything(),
  );
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
    proof.url,
    "medapp://onboarding-status",
    { preferEphemeralSession: true },
  );
  expect(client.delete).toHaveBeenCalled();
  expect(await AsyncStorage.getItem(pendingKey)).toBeNull();
});
it("persists a return marker before opening the native browser", async () => {
  jest.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(async () => {
    const saved = JSON.parse((await AsyncStorage.getItem(pendingKey))!);
    expect(saved).toEqual({ owner: "user", state, expiresAt: expect.any(Number) });
    expect(saved.expiresAt).toBeGreaterThan(Date.now());
    return { type: "cancel" } as WebBrowser.WebBrowserAuthSessionResult;
  });
  await openOnboarding({ owner: "user" });
  expect(await AsyncStorage.getItem(pendingKey)).toBeNull();
});
it("retains a return marker when the screen unmounts so a new native instance can consume it once", async () => {
  const controller = new AbortController();
  jest.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(async () => {
    controller.abort();
    return { type: "dismiss" } as WebBrowser.WebBrowserAuthSessionResult;
  });
  await expect(openOnboarding({ owner: "user", signal: controller.signal })).resolves.toBe(
    "closed",
  );
  expect(WebBrowser.dismissAuthSession).toHaveBeenCalledTimes(1);
  await expect(consumeNativeOnboardingReturn("user", state)).resolves.toBe(true);
  await expect(consumeNativeOnboardingReturn("user", state)).rejects.toThrow(
    "could not be matched",
  );
});
it.each([
  ["other", state, Date.now() + 60000],
  ["user", "b".repeat(32), Date.now() + 60000],
  ["user", state, 0],
])(
  "rejects a mismatched or expired marker without removing another pending return",
  async (owner, savedState, expiresAt) => {
    const saved = JSON.stringify({ owner, state: savedState, expiresAt });
    await AsyncStorage.setItem(pendingKey, saved);
    await expect(consumeNativeOnboardingReturn("user", state)).rejects.toThrow(
      "could not be matched",
    );
    expect(await AsyncStorage.getItem(pendingKey)).toBe(saved);
  },
);
it.each(["short", [state, state], null])(
  "rejects malformed native return parameters",
  async (value) => {
    await expect(consumeNativeOnboardingReturn("user", value)).rejects.toThrow("not recognized");
  },
);
it("leaves a pending marker intact when there is no return parameter", async () => {
  const saved = JSON.stringify({ owner: "user", state, expiresAt: Date.now() + 60000 });
  await AsyncStorage.setItem(pendingKey, saved);
  await expect(consumeNativeOnboardingReturn("user", undefined)).resolves.toBe(false);
  expect(await AsyncStorage.getItem(pendingKey)).toBe(saved);
});
it.each([
  "https://evil.example/handoff#code=" + "a".repeat(64),
  "http://localhost:3003/handoff?token=secret",
  "http://localhost:3003/other#code=" + "a".repeat(64),
])("rejects an unexpected website link %s", async (url) => {
  jest.mocked(client.post).mockResolvedValue({ ...proof, url });
  await expect(openOnboarding({ owner: "user" })).rejects.toThrow();
  expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
});
it("does not open a link after the account changes while preparing it", async () => {
  let current = true;
  jest.mocked(client.post).mockImplementation(async () => {
    current = false;
    return proof;
  });
  await expect(openOnboarding({ owner: "user", isSessionCurrent: () => current })).rejects.toThrow(
    "sign-in changed",
  );
  expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
});
it("reports browser dismissal without claiming a successful return", async () => {
  jest
    .mocked(WebBrowser.openAuthSessionAsync)
    .mockResolvedValue({ type: "cancel" } as WebBrowser.WebBrowserAuthSessionResult);
  await expect(openOnboarding({ owner: "user" })).resolves.toBe("closed");
});
it("rejects forged return state and privileged destinations", () => {
  expect(
    validOnboardingReturn(
      `medapp://onboarding-status?handoff_state=${state}`,
      "medapp://onboarding-status",
      state,
    ),
  ).toBe(true);
  expect(
    validOnboardingReturn(
      `medapp://practitioner-home?handoff_state=${state}`,
      "medapp://onboarding-status",
      state,
    ),
  ).toBe(false);
  expect(
    validOnboardingReturn(
      "medapp://onboarding-status?handoff_state=wrong&role=doctor",
      "medapp://onboarding-status",
      state,
    ),
  ).toBe(false);
  expect(() => validateOnboardingLink(proof.url, "http://external.example")).toThrow();
});

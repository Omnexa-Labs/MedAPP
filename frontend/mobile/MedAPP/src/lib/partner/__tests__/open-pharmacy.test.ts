import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { client } from "@/lib/api/client";
import {
  consumeNativePharmacyReturn,
  openPharmacyPortal,
  validatePharmacyLink,
} from "../open-pharmacy";
import { consumeNativeOnboardingReturn } from "../open-onboarding";
jest.mock("expo-crypto", () => ({ randomUUID: () => "11111111-1111-4111-8111-111111111111" }));
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
  dismissAuthSession: jest.fn(),
}));
jest.mock("@/lib/config", () => ({
  config: {
    appEnv: "dev",
    pharmacyPortalUrl: "http://localhost:3002",
    partnerOnboardingUrl: "http://localhost:3003",
  },
}));
jest.mock("@/lib/api/client", () => ({ client: { post: jest.fn(), delete: jest.fn() } }));
const options = { owner: "owner", pharmacyId: "33333333-3333-4333-8333-333333333333", portalOrigin: "http://localhost:3002" };
const state = "11111111111141118111111111111111";
const proof = {
  handoff_id: "22222222-2222-4222-8222-222222222222",
  url: `http://localhost:3002/handoff#code=${"h".repeat(64)}`,
  expires_in: 120,
};
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.replaceProperty(Platform, "OS", "ios");
  jest.mocked(client.post).mockResolvedValue(proof);
  jest.mocked(client.delete).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());
it("rejects a proof for a different pharmacy website before opening a browser", async () => {
  jest.mocked(client.post).mockResolvedValue({ ...proof, url: proof.url.replace("localhost", "other.example") });
  await expect(openPharmacyPortal(options)).rejects.toThrow();
  expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
});
it("requires a pharmacy ID before requesting a proof", async () => {
  await expect(openPharmacyPortal({ ...options, pharmacyId: "invalid" })).rejects.toThrow();
  expect(client.post).not.toHaveBeenCalled();
});
it("uses the pharmacy proof endpoint with the selected pharmacy target and checks its return", async () => {
  jest
    .mocked(WebBrowser.openAuthSessionAsync)
    .mockResolvedValue({
      type: "success",
      url: `medapp://pharmacy-workspaces?handoff_state=${state}`,
    } as WebBrowser.WebBrowserAuthSessionResult);
  await expect(openPharmacyPortal(options)).resolves.toBe("returned");
  expect(client.post).toHaveBeenCalledWith(
    "/v1/auth/pharmacy-handoffs",
    { pharmacy_id: options.pharmacyId, return_uri: "medapp://pharmacy-workspaces", return_state: state },
    expect.anything(),
  );
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
    proof.url,
    "medapp://pharmacy-workspaces",
    { preferEphemeralSession: true },
  );
  expect(client.delete).toHaveBeenCalledWith(
    `/v1/auth/pharmacy-handoffs/${proof.handoff_id}`,
    expect.anything(),
  );
});
it("keeps a cold pharmacy return separate from the onboarding return marker", async () => {
  const controller = new AbortController();
  await AsyncStorage.setItem(
    "medapp-partner-return",
    JSON.stringify({ owner: "owner", state, expiresAt: Date.now() + 60000 }),
  );
  jest.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(async () => {
    controller.abort();
    return { type: "dismiss" } as WebBrowser.WebBrowserAuthSessionResult;
  });
  await openPharmacyPortal({ ...options, signal: controller.signal });
  await expect(consumeNativePharmacyReturn("owner", state)).resolves.toBe(true);
  await expect(consumeNativeOnboardingReturn("owner", state)).resolves.toBe(true);
  await expect(consumeNativePharmacyReturn("owner", state)).rejects.toThrow("could not be matched");
});
it("rejects an onboarding return from the pharmacy browser", async () => {
  jest
    .mocked(WebBrowser.openAuthSessionAsync)
    .mockResolvedValue({
      type: "success",
      url: `medapp://onboarding-status?handoff_state=${state}`,
    } as WebBrowser.WebBrowserAuthSessionResult);
  await expect(openPharmacyPortal(options)).rejects.toThrow(
    "pharmacy return was not recognized",
  );
});
it("refuses another portal's origin and an unconfigured environment", () => {
  expect(() =>
    validatePharmacyLink(proof.url.replace(":3002", ":3003"), "http://localhost:3002"),
  ).toThrow();
  expect(() => validatePharmacyLink(proof.url, "")).toThrow("not configured");
});

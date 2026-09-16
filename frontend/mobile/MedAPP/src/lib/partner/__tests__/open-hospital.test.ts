import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { client } from "@/lib/api/client";
import {
  consumeNativeHospitalReturn,
  openHospitalPortal,
  validateHospitalLink,
} from "../open-hospital";
import { consumeNativeOnboardingReturn } from "../open-onboarding";
jest.mock("expo-crypto", () => ({ randomUUID: () => "11111111-1111-4111-8111-111111111111" }));
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
  dismissAuthSession: jest.fn(),
}));
jest.mock("@/lib/config", () => ({
  config: {
    appEnv: "dev",
    hospitalPortalUrl: "http://localhost:3001",
    partnerOnboardingUrl: "http://localhost:3003",
  },
}));
jest.mock("@/lib/api/client", () => ({ client: { post: jest.fn(), delete: jest.fn() } }));
const state = "11111111111141118111111111111111";
const proof = {
  handoff_id: "22222222-2222-4222-8222-222222222222",
  url: `http://localhost:3001/handoff#code=${"h".repeat(64)}`,
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
it("uses the hospital proof endpoint without an application target and checks its return", async () => {
  jest
    .mocked(WebBrowser.openAuthSessionAsync)
    .mockResolvedValue({
      type: "success",
      url: `medapp://hospital-workspaces?handoff_state=${state}`,
    } as WebBrowser.WebBrowserAuthSessionResult);
  await expect(openHospitalPortal({ owner: "owner" })).resolves.toBe("returned");
  expect(client.post).toHaveBeenCalledWith(
    "/v1/auth/hospital-handoffs",
    { return_uri: "medapp://hospital-workspaces", return_state: state },
    expect.anything(),
  );
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
    proof.url,
    "medapp://hospital-workspaces",
    { preferEphemeralSession: true },
  );
  expect(client.delete).toHaveBeenCalledWith(
    `/v1/auth/hospital-handoffs/${proof.handoff_id}`,
    expect.anything(),
  );
});
it("keeps a cold hospital return separate from the onboarding return marker", async () => {
  const controller = new AbortController();
  await AsyncStorage.setItem(
    "medapp-partner-return",
    JSON.stringify({ owner: "owner", state, expiresAt: Date.now() + 60000 }),
  );
  jest.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(async () => {
    controller.abort();
    return { type: "dismiss" } as WebBrowser.WebBrowserAuthSessionResult;
  });
  await openHospitalPortal({ owner: "owner", signal: controller.signal });
  await expect(consumeNativeHospitalReturn("owner", state)).resolves.toBe(true);
  await expect(consumeNativeOnboardingReturn("owner", state)).resolves.toBe(true);
  await expect(consumeNativeHospitalReturn("owner", state)).rejects.toThrow("could not be matched");
});
it("rejects an onboarding return from the hospital browser", async () => {
  jest
    .mocked(WebBrowser.openAuthSessionAsync)
    .mockResolvedValue({
      type: "success",
      url: `medapp://onboarding-status?handoff_state=${state}`,
    } as WebBrowser.WebBrowserAuthSessionResult);
  await expect(openHospitalPortal({ owner: "owner" })).rejects.toThrow(
    "hospital return was not recognized",
  );
});
it("refuses another portal's origin and an unconfigured environment", () => {
  expect(() =>
    validateHospitalLink(proof.url.replace(":3001", ":3003"), "http://localhost:3001"),
  ).toThrow();
  expect(() => validateHospitalLink(proof.url, "")).toThrow("not configured");
});

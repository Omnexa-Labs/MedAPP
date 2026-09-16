import { Platform } from "react-native";
import Constants from "expo-constants";
import { loadNativeProviders, ProviderCancelled } from "../native-providers";
import { GoogleOneTapSignIn } from "react-native-nitro-google-signin";
import * as Apple from "expo-apple-authentication";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { executionEnvironment: "standalone", expoConfig: { extra: {} } },
  ExecutionEnvironment: { StoreClient: "storeClient" },
}));
jest.mock("react-native-nitro-google-signin", () => ({
  GoogleSignInButton: () => null,
  GoogleOneTapSignIn: {
    configure: jest.fn(),
    checkPlayServices: jest.fn(),
    presentExplicitSignIn: jest.fn(),
  },
  isCancelledResponse: (r: { type: string }) => r.type === "cancelled",
  isSuccessResponse: (r: { type: string }) => r.type === "success",
  isErrorWithCode: () => false,
  statusCodes: { SIGN_IN_CANCELLED: "cancelled" },
}));
jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationButton: () => null,
  AppleAuthenticationScope: { EMAIL: 0 },
  AppleAuthenticationButtonType: { CONTINUE: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 1 },
}));
const originalOS = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
  Object.assign(Constants, {
    executionEnvironment: "standalone",
    expoConfig: {
      extra: { googleWebClientId: "web", googleIosClientId: "ios", appleSignInEnabled: true },
    },
  });
  jest
    .mocked(GoogleOneTapSignIn.presentExplicitSignIn)
    .mockResolvedValue({ type: "success", data: { idToken: "google-proof" } } as never);
  jest.mocked(Apple.isAvailableAsync).mockResolvedValue(true);
});
afterAll(() => Object.defineProperty(Platform, "OS", { configurable: true, value: originalOS }));
test("web and Expo Go retain email authentication without loading native providers", async () => {
  Object.defineProperty(Platform, "OS", { value: "web" });
  expect(await loadNativeProviders()).toEqual({});
  Object.defineProperty(Platform, "OS", { value: "ios" });
  Object.assign(Constants, { executionEnvironment: "storeClient" });
  expect(await loadNativeProviders()).toEqual({});
  expect(Apple.isAvailableAsync).not.toHaveBeenCalled();
});
test("Google uses explicit selection and passes the server nonce without extra scopes", async () => {
  const providers = await loadNativeProviders();
  expect(providers.apple).toBeUndefined();
  expect(await providers.google!.authenticate("server-nonce")).toBe("google-proof");
  expect(GoogleOneTapSignIn.configure).toHaveBeenCalledWith({
    webClientId: "web",
    iosClientId: "ios",
    nonce: "server-nonce",
    offlineAccess: false,
    autoSelectOnSignIn: false,
  });
  expect(GoogleOneTapSignIn.checkPlayServices).toHaveBeenCalled();
});
test("Google cancellation does not return a cached credential", async () => {
  jest
    .mocked(GoogleOneTapSignIn.presentExplicitSignIn)
    .mockResolvedValue({ type: "cancelled" } as never);
  const providers = await loadNativeProviders();
  await expect(providers.google!.authenticate("nonce")).rejects.toBeInstanceOf(ProviderCancelled);
});
test("Apple passes nonce/state and rejects a mismatched native response", async () => {
  Object.defineProperty(Platform, "OS", { value: "ios" });
  jest
    .mocked(Apple.signInAsync)
    .mockResolvedValue({ identityToken: "apple-proof", state: "nonce" } as never);
  const providers = await loadNativeProviders();
  expect(await providers.apple!.authenticate("nonce")).toBe("apple-proof");
  expect(Apple.signInAsync).toHaveBeenCalledWith({
    nonce: "nonce",
    state: "nonce",
    requestedScopes: [Apple.AppleAuthenticationScope.EMAIL],
  });
  jest
    .mocked(Apple.signInAsync)
    .mockResolvedValue({ identityToken: "apple-proof", state: "wrong" } as never);
  await expect(providers.apple!.authenticate("nonce")).rejects.toThrow("matching sign-in proof");
});

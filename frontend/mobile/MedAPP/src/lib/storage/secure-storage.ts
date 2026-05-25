import * as SecureStore from "expo-secure-store";

// Thin wrapper over expo-secure-store for sensitive credentials.
// Only stores small strings (SecureStore has a ~2KB per-key cap on Android).
//
// Features never import expo-secure-store directly — they go through this
// module so we have one place to add observability, key prefixing, or migrate
// to a different backing store if needed.

const TOKEN_KEY = "medapp.auth.accessToken";
const REFRESH_KEY = "medapp.auth.refreshToken";
// Per-install device id, sent as X-Device-Id on every request. The
// backend binds refresh tokens to this id so a token exfiltrated from
// a backup cannot be replayed from a different install. Stored
// separately from tokens — logout intentionally does NOT clear it,
// since the install's identity outlives a single sign-in.
const DEVICE_ID_KEY = "medapp.device.id";

export const secureStorage = {
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async setAccessToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clearAccessToken(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_KEY, token);
  },
  async clearRefreshToken(): Promise<void> {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
  async getDeviceId(): Promise<string | null> {
    return SecureStore.getItemAsync(DEVICE_ID_KEY);
  },
  async setDeviceId(id: string): Promise<void> {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  },
  /** Clears tokens. Device id intentionally retained — see comment above. */
  async clearAll(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
    ]);
  },
};

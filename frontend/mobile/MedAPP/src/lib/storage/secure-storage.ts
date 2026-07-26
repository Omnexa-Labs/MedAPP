import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

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

// expo-secure-store has no web implementation. On web we fall back to
// localStorage — less secure than hardware-backed storage, but acceptable
// for development. localStorage is not sessionStorage: tokens survive a
// tab close the same way native tokens survive an app restart.
const webStore = {
  getItemAsync: (key: string): Promise<string | null> =>
    Promise.resolve(localStorage.getItem(key)),
  setItemAsync: (key: string, value: string): Promise<void> => {
    localStorage.setItem(key, value);
    return Promise.resolve();
  },
  deleteItemAsync: (key: string): Promise<void> => {
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};

const store = Platform.OS === "web" ? webStore : SecureStore;

export const secureStorage = {
  async getAccessToken(): Promise<string | null> {
    return store.getItemAsync(TOKEN_KEY);
  },
  async setAccessToken(token: string): Promise<void> {
    await store.setItemAsync(TOKEN_KEY, token);
  },
  async clearAccessToken(): Promise<void> {
    await store.deleteItemAsync(TOKEN_KEY);
  },
  async getRefreshToken(): Promise<string | null> {
    return store.getItemAsync(REFRESH_KEY);
  },
  async setRefreshToken(token: string): Promise<void> {
    await store.setItemAsync(REFRESH_KEY, token);
  },
  async clearRefreshToken(): Promise<void> {
    await store.deleteItemAsync(REFRESH_KEY);
  },
  async getDeviceId(): Promise<string | null> {
    return store.getItemAsync(DEVICE_ID_KEY);
  },
  async setDeviceId(id: string): Promise<void> {
    await store.setItemAsync(DEVICE_ID_KEY, id);
  },
  /** Clears tokens. Device id intentionally retained — see comment above. */
  async clearAll(): Promise<void> {
    await Promise.all([
      store.deleteItemAsync(TOKEN_KEY),
      store.deleteItemAsync(REFRESH_KEY),
    ]);
  },
};

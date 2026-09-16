import * as SecureStore from "expo-secure-store";
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  randomUUID,
} from "expo-crypto";
import { Platform } from "react-native";

// Thin wrapper over expo-secure-store for sensitive credentials.
// Only stores small strings (SecureStore has a ~2KB per-key cap on Android).
//
// Features never import expo-secure-store directly — they go through this
// module so we have one place to add observability, key prefixing, or migrate
// to a different backing store if needed.

const TOKEN_KEY = "medapp.auth.accessToken";
const REFRESH_KEY = "medapp.auth.refreshToken";
const BIOMETRIC_KEY = "medapp.auth.biometric.v1";

interface BiometricEnvelope {
  version: 1;
  keyId: string;
  ownerId: string;
  sealed: string;
}
let unlocked: { key: AESEncryptionKey; keyId: string; refreshToken: string } | null = null;

export class BiometricStorageError extends Error {
  constructor(
    public readonly kind: "unsupported" | "missing" | "unavailable" | "cancelled" | "changed",
  ) {
    super(`Biometric credential ${kind}`);
    this.name = "BiometricStorageError";
  }
}

function protectedOptions(keyId: string): SecureStore.SecureStoreOptions {
  return {
    requireAuthentication: true,
    keychainService: keyId,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    authenticationPrompt: "Unlock your MedApp sign-in",
  };
}

async function envelope(): Promise<BiometricEnvelope | null> {
  if (Platform.OS === "web") return null;
  const raw = await SecureStore.getItemAsync(BIOMETRIC_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw) as BiometricEnvelope;
  if (
    value.version !== 1 ||
    !/^medapp\.auth\.bio\.[a-f0-9-]+$/.test(value.keyId) ||
    typeof value.ownerId !== "string" ||
    typeof value.sealed !== "string"
  ) {
    throw new BiometricStorageError("unavailable");
  }
  return value;
}

function context(value: Pick<BiometricEnvelope, "keyId" | "ownerId">): Uint8Array {
  return new TextEncoder().encode(`medapp.biometric.v1:${value.keyId}:${value.ownerId}`);
}

async function seal(
  refreshToken: string,
  key: AESEncryptionKey,
  value: Pick<BiometricEnvelope, "keyId" | "ownerId">,
) {
  const data = await aesEncryptAsync(new TextEncoder().encode(refreshToken), key, {
    additionalData: context(value),
  });
  return data.combined("base64");
}
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
//
// "Acceptable for development" was the whole justification, and nothing
// enforced it: `expo start --web` and a production web export take the same
// branch, so a shipped web build would put PHI-scoped JWTs somewhere any
// injected script can read (`localStorage` is not origin-isolated from XSS).
// Outside __DEV__ this now throws instead. A web build that needs to ship must
// first give this module a real backing store (httpOnly cookie session, or
// in-memory + silent refresh) — not inherit the dev shim by omission.
function assertWebFallbackAllowed(): void {
  if (!__DEV__) {
    throw new Error(
      "secure-storage: refusing to store credentials in localStorage on web. " +
        "expo-secure-store has no web implementation and the localStorage " +
        "fallback is XSS-readable — it is a development-only shim.",
    );
  }
}

const webStore = {
  getItemAsync: (key: string): Promise<string | null> => {
    assertWebFallbackAllowed();
    return Promise.resolve(localStorage.getItem(key));
  },
  setItemAsync: (key: string, value: string): Promise<void> => {
    assertWebFallbackAllowed();
    localStorage.setItem(key, value);
    return Promise.resolve();
  },
  deleteItemAsync: (key: string): Promise<void> => {
    // Deletion is the one operation that stays permitted: a build that flipped
    // to the guard must still be able to clear anything an earlier dev build
    // left behind, and refusing to delete credentials is not a safer failure.
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};

const store = Platform.OS === "web" ? webStore : SecureStore;

export const secureStorage = {
  async getAccessToken(): Promise<string | null> {
    // An enrolled cold start must reach sign-in, never silently open the account.
    if (await envelope()) return null;
    return store.getItemAsync(TOKEN_KEY);
  },
  async setAccessToken(token: string): Promise<void> {
    if (await envelope()) {
      await store.deleteItemAsync(TOKEN_KEY);
      return;
    }
    await store.setItemAsync(TOKEN_KEY, token);
  },
  async clearAccessToken(): Promise<void> {
    await store.deleteItemAsync(TOKEN_KEY);
  },
  async getRefreshToken(): Promise<string | null> {
    const value = await envelope();
    if (value) return unlocked?.keyId === value.keyId ? unlocked.refreshToken : null;
    return store.getItemAsync(REFRESH_KEY);
  },
  async setRefreshToken(token: string): Promise<void> {
    const value = await envelope();
    if (value) {
      const credential = unlocked;
      if (!credential || credential.keyId !== value.keyId)
        throw new BiometricStorageError("missing");
      const sealed = await seal(token, credential.key, value);
      await SecureStore.setItemAsync(BIOMETRIC_KEY, JSON.stringify({ ...value, sealed }));
      credential.refreshToken = token;
      return;
    }
    await store.setItemAsync(REFRESH_KEY, token);
  },
  async clearRefreshToken(): Promise<void> {
    await secureStorage.clearBiometric();
    await store.deleteItemAsync(REFRESH_KEY);
  },
  canUseBiometrics(): boolean {
    return Platform.OS !== "web" && SecureStore.canUseBiometricAuthentication();
  },
  async biometricOwner(): Promise<string | null> {
    return (await envelope())?.ownerId ?? null;
  },
  lockBiometric(): void {
    unlocked = null;
  },
  async clearBiometric(): Promise<void> {
    unlocked = null;
    const value = await envelope().catch(() => null);
    if (Platform.OS === "web") return;
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
    if (value) {
      // An orphaned protected key cannot authenticate without its deleted payload.
      await SecureStore.deleteItemAsync(value.keyId, protectedOptions(value.keyId)).catch(() => {});
    }
  },
  async enableBiometric(ownerId: string, isCurrent: () => boolean): Promise<void> {
    if (!secureStorage.canUseBiometrics()) throw new BiometricStorageError("unsupported");
    if (await envelope()) throw new BiometricStorageError("changed");
    const assertCurrent = () => {
      if (!isCurrent()) throw new BiometricStorageError("changed");
    };
    const keyId = `medapp.auth.bio.${randomUUID()}`;
    let previousAccess: string | null = null;
    let previousRefresh: string | null = null;
    try {
      const generated = await AESEncryptionKey.generate();
      await SecureStore.setItemAsync(
        keyId,
        await generated.encoded("base64"),
        protectedOptions(keyId),
      );
      // iOS doesn't prompt when creating a key: read it back to confirm enrollment.
      const rawKey = await SecureStore.getItemAsync(keyId, protectedOptions(keyId));
      assertCurrent();
      if (!rawKey) throw new BiometricStorageError("unavailable");
      const key = await AESEncryptionKey.import(rawKey, "base64");
      previousAccess = await store.getItemAsync(TOKEN_KEY);
      previousRefresh = await store.getItemAsync(REFRESH_KEY);
      if (!previousRefresh) throw new BiometricStorageError("missing");
      const value: BiometricEnvelope = {
        version: 1,
        keyId,
        ownerId,
        sealed: await seal(previousRefresh, key, { keyId, ownerId }),
      };
      assertCurrent();
      await store.deleteItemAsync(TOKEN_KEY);
      await store.deleteItemAsync(REFRESH_KEY);
      assertCurrent();
      await SecureStore.setItemAsync(BIOMETRIC_KEY, JSON.stringify(value));
      assertCurrent();
      unlocked = { key, keyId, refreshToken: previousRefresh };
    } catch (error) {
      // A native write can fail after committing. Inspect and remove our own
      // envelope before restoring ordinary credentials; never keep both modes.
      let removed = true;
      try {
        if ((await envelope())?.keyId === keyId) await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
      } catch {
        removed = false;
      }
      if (removed)
        await SecureStore.deleteItemAsync(keyId, protectedOptions(keyId)).catch(() => {});
      if (isCurrent() && removed) {
        if (previousAccess) await store.setItemAsync(TOKEN_KEY, previousAccess);
        if (previousRefresh) await store.setItemAsync(REFRESH_KEY, previousRefresh);
      }
      if (
        /cancel/i.test(String(error)) ||
        /cancel/i.test(String((error as { code?: string })?.code ?? ""))
      ) {
        throw new BiometricStorageError("cancelled");
      }
      throw error;
    }
  },
  async unlockBiometric(): Promise<{ refreshToken: string; ownerId: string }> {
    const value = await envelope();
    if (!value) throw new BiometricStorageError("missing");
    if (!secureStorage.canUseBiometrics()) throw new BiometricStorageError("unsupported");
    let rawKey: string | null;
    try {
      rawKey = await SecureStore.getItemAsync(value.keyId, protectedOptions(value.keyId));
    } catch (error) {
      const code = String((error as { code?: string })?.code ?? "");
      if (/cancel/i.test(code) || /cancel/i.test(String(error)))
        throw new BiometricStorageError("cancelled");
      throw new BiometricStorageError("unavailable");
    }
    if (!rawKey) throw new BiometricStorageError("unavailable");
    const key = await AESEncryptionKey.import(rawKey, "base64");
    const plaintext = await aesDecryptAsync(AESSealedData.fromCombined(value.sealed), key, {
      additionalData: context(value),
    });
    const refreshToken = new TextDecoder().decode(plaintext);
    if (!refreshToken) throw new BiometricStorageError("unavailable");
    unlocked = { key, keyId: value.keyId, refreshToken };
    return { refreshToken, ownerId: value.ownerId };
  },
  async disableBiometric(accessToken: string): Promise<void> {
    const value = await envelope();
    if (!value) throw new BiometricStorageError("missing");
    // Changing this protection requires fresh device authentication, even while
    // the existing app session is unlocked.
    const credential = await secureStorage.unlockBiometric();
    try {
      await store.setItemAsync(REFRESH_KEY, credential.refreshToken);
      await store.setItemAsync(TOKEN_KEY, accessToken);
      await secureStorage.clearBiometric();
    } catch (error) {
      await Promise.allSettled([
        store.deleteItemAsync(TOKEN_KEY),
        store.deleteItemAsync(REFRESH_KEY),
      ]);
      throw error;
    }
  },
  async getDeviceId(): Promise<string | null> {
    return store.getItemAsync(DEVICE_ID_KEY);
  },
  async setDeviceId(id: string): Promise<void> {
    await store.setItemAsync(DEVICE_ID_KEY, id);
  },
  /** Clears tokens. Device id intentionally retained — see comment above. */
  async clearAll(): Promise<void> {
    const results = await Promise.allSettled([
      secureStorage.clearBiometric(),
      store.deleteItemAsync(TOKEN_KEY),
      store.deleteItemAsync(REFRESH_KEY),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  },
};

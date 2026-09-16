const mockData = new Map<string, string>();
let mockSupported = true;
let mockCancelled = false;
let mockDeleteFailure: string | null = null;
let mockWriteThenFail: string | null = null;
const mockProtectedRead = jest.fn();
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
  canUseBiometricAuthentication: () => mockSupported,
  getItemAsync: async (key: string, options?: { requireAuthentication?: boolean }) => {
    if (key.startsWith("medapp.auth.bio.")) {
      mockProtectedRead(key, options);
      if (!options?.requireAuthentication) throw new Error("Unprotected key read");
      if (mockCancelled)
        throw Object.assign(new Error("User cancelled"), { code: "ERR_AUTH_CANCELLED" });
    }
    return mockData.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    mockData.set(key, value);
    if (key === mockWriteThenFail) {
      mockWriteThenFail = null;
      throw new Error("uncertain native write");
    }
  },
  deleteItemAsync: async (key: string) => {
    if (key === mockDeleteFailure) {
      mockDeleteFailure = null;
      throw new Error("storage unavailable");
    }
    mockData.delete(key);
  },
}));

// Real AES-GCM under the SDK's JS contract; device/keychain prompts are mocked.
// Native authentication and Expo's native crypto bridge still need device QA.
jest.mock("expo-crypto", () => {
  const crypto = require("node:crypto");
  class Key {
    bytes: Buffer;
    constructor(raw: Buffer) {
      this.bytes = raw;
    }
    static async generate() {
      return new Key(crypto.randomBytes(32));
    }
    static async import(raw: string) {
      return new Key(Buffer.from(raw, "base64"));
    }
    async encoded() {
      return this.bytes.toString("base64");
    }
  }
  return {
    randomUUID: crypto.randomUUID,
    AESEncryptionKey: Key,
    AESSealedData: { fromCombined: (raw: string) => Buffer.from(raw, "base64") },
    aesEncryptAsync: async (
      plaintext: Uint8Array,
      key: Key,
      options: { additionalData: Uint8Array },
    ) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key.bytes, iv);
      cipher.setAAD(options.additionalData);
      const bytes = Buffer.concat([
        iv,
        cipher.update(plaintext),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
      return { combined: async () => bytes.toString("base64") };
    },
    aesDecryptAsync: async (bytes: Buffer, key: Key, options: { additionalData: Uint8Array }) => {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key.bytes, bytes.subarray(0, 12));
      decipher.setAAD(options.additionalData);
      decipher.setAuthTag(bytes.subarray(-16));
      return new Uint8Array(
        Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]),
      );
    },
  };
});

import { secureStorage } from "../secure-storage";
const accessKey = "medapp.auth.accessToken";
const refreshKey = "medapp.auth.refreshToken";
const envelopeKey = "medapp.auth.biometric.v1";

beforeEach(async () => {
  secureStorage.lockBiometric();
  mockData.clear();
  mockProtectedRead.mockClear();
  mockSupported = true;
  mockCancelled = false;
  mockDeleteFailure = null;
  mockWriteThenFail = null;
  await secureStorage.setAccessToken("synthetic-access");
  await secureStorage.setRefreshToken("synthetic-refresh");
});

test("enrollment requires protected readback and removes ordinary bearer credentials", async () => {
  await secureStorage.enableBiometric("patient-a", () => true);
  expect(mockProtectedRead).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ requireAuthentication: true, keychainAccessible: 7 }),
  );
  expect(mockData.has(accessKey)).toBe(false);
  expect(mockData.has(refreshKey)).toBe(false);
  expect(mockData.get(envelopeKey)).not.toContain("synthetic-refresh");
  expect(await secureStorage.biometricOwner()).toBe("patient-a");
  expect(await secureStorage.getRefreshToken()).toBe("synthetic-refresh");
});

test("locked and cold sessions cannot hydrate or silently read a refresh credential", async () => {
  await secureStorage.enableBiometric("patient-a", () => true);
  secureStorage.lockBiometric();
  mockProtectedRead.mockClear();
  expect(await secureStorage.getAccessToken()).toBeNull();
  expect(await secureStorage.getRefreshToken()).toBeNull();
  expect(await secureStorage.biometricOwner()).toBe("patient-a");
  expect(mockProtectedRead).not.toHaveBeenCalled();
  expect(await secureStorage.unlockBiometric()).toEqual({
    ownerId: "patient-a",
    refreshToken: "synthetic-refresh",
  });
  expect(mockProtectedRead).toHaveBeenCalledTimes(1);
});

test("rotation persists a newly sealed credential without another protected-key prompt", async () => {
  await secureStorage.enableBiometric("patient-a", () => true);
  const oldEnvelope = mockData.get(envelopeKey);
  mockProtectedRead.mockClear();
  await secureStorage.setAccessToken("rotated-access");
  await secureStorage.setRefreshToken("rotated-refresh");
  expect(mockProtectedRead).not.toHaveBeenCalled();
  expect(mockData.get(envelopeKey)).not.toEqual(oldEnvelope);
  expect(mockData.has(accessKey)).toBe(false);
  expect(mockData.has(refreshKey)).toBe(false);
  secureStorage.lockBiometric();
  expect((await secureStorage.unlockBiometric()).refreshToken).toBe("rotated-refresh");
});

test("cancelling enrollment leaves the existing password session usable and off", async () => {
  mockCancelled = true;
  await expect(secureStorage.enableBiometric("patient-a", () => true)).rejects.toThrow();
  expect(await secureStorage.biometricOwner()).toBeNull();
  expect(await secureStorage.getRefreshToken()).toBe("synthetic-refresh");
  expect([...mockData.keys()].filter((key) => key.startsWith("medapp.auth.bio."))).toHaveLength(0);
});

test("failed plaintext cleanup rolls enrollment back instead of reporting protection", async () => {
  mockDeleteFailure = refreshKey;
  await expect(secureStorage.enableBiometric("patient-a", () => true)).rejects.toThrow();
  expect(await secureStorage.biometricOwner()).toBeNull();
  expect(await secureStorage.getAccessToken()).toBe("synthetic-access");
  expect(await secureStorage.getRefreshToken()).toBe("synthetic-refresh");
});

test("changed account aborts enrollment without restoring its credentials", async () => {
  await expect(secureStorage.enableBiometric("patient-a", () => false)).rejects.toThrow("changed");
  expect(await secureStorage.biometricOwner()).toBeNull();
  expect([...mockData.keys()].filter((key) => key.startsWith("medapp.auth.bio."))).toHaveLength(0);
});

test("disable restores the latest password-session credentials and deletes enrollment", async () => {
  await secureStorage.enableBiometric("patient-a", () => true);
  await secureStorage.setRefreshToken("latest-refresh");
  await secureStorage.disableBiometric("latest-access");
  expect(await secureStorage.biometricOwner()).toBeNull();
  expect(await secureStorage.getAccessToken()).toBe("latest-access");
  expect(await secureStorage.getRefreshToken()).toBe("latest-refresh");
  expect([...mockData.keys()].filter((key) => key.startsWith("medapp.auth.bio."))).toHaveLength(0);
});

test("ciphertext and account metadata tampering cannot unlock a credential", async () => {
  await secureStorage.enableBiometric("patient-a", () => true);
  secureStorage.lockBiometric();
  const value = JSON.parse(mockData.get(envelopeKey)!);
  mockData.set(envelopeKey, JSON.stringify({ ...value, ownerId: "patient-b" }));
  await expect(secureStorage.unlockBiometric()).rejects.toThrow();
  expect(await secureStorage.getRefreshToken()).toBeNull();
});

test("revoked device key requires password recovery; cancellation keeps enrollment", async () => {
  await secureStorage.enableBiometric("patient-a", () => true);
  secureStorage.lockBiometric();
  mockCancelled = true;
  await expect(secureStorage.unlockBiometric()).rejects.toMatchObject({ kind: "cancelled" });
  expect(await secureStorage.biometricOwner()).toBe("patient-a");
  mockCancelled = false;
  mockData.delete(JSON.parse(mockData.get(envelopeKey)!).keyId);
  await expect(secureStorage.unlockBiometric()).rejects.toMatchObject({ kind: "unavailable" });
  expect(await secureStorage.getRefreshToken()).toBeNull();
});

test("sign-out removes the vault and tokens while retaining the install ID", async () => {
  await secureStorage.setDeviceId("synthetic-install");
  await secureStorage.enableBiometric("patient-a", () => true);
  await secureStorage.clearAll();
  expect(await secureStorage.biometricOwner()).toBeNull();
  expect(await secureStorage.getAccessToken()).toBeNull();
  expect(await secureStorage.getRefreshToken()).toBeNull();
  expect(await secureStorage.getDeviceId()).toBe("synthetic-install");
});

test("unsupported devices never create a biometric credential", async () => {
  mockSupported = false;
  await expect(secureStorage.enableBiometric("patient-a", () => true)).rejects.toMatchObject({
    kind: "unsupported",
  });
  expect(mockProtectedRead).not.toHaveBeenCalled();
  expect(await secureStorage.getRefreshToken()).toBe("synthetic-refresh");
});

test("an uncertain enrollment write never leaves both protected and ordinary credentials", async () => {
  mockWriteThenFail = envelopeKey;
  await expect(secureStorage.enableBiometric("patient-a", () => true)).rejects.toThrow();
  expect(await secureStorage.biometricOwner()).toBeNull();
  expect(await secureStorage.getAccessToken()).toBe("synthetic-access");
  expect(await secureStorage.getRefreshToken()).toBe("synthetic-refresh");
});

test("cancelling a fresh device prompt cannot disable enrollment", async () => {
  await secureStorage.enableBiometric("patient-a", () => true);
  mockCancelled = true;
  await expect(secureStorage.disableBiometric("synthetic-access")).rejects.toMatchObject({
    kind: "cancelled",
  });
  expect(await secureStorage.biometricOwner()).toBe("patient-a");
  expect(mockData.has(refreshKey)).toBe(false);
});

// Sign-out used to be local-only: `useAuthStore.signOut` called
// `secureStorage.clearAll()` and nothing else, while `authApi.signOut` — the
// wrapper around POST /v1/auth/logout — had ZERO callers. The refresh token
// stayed valid server-side after the user believed the session was closed.
//
// The other half of the session story lives here too: the refresher the api
// client invokes on a 401. The client owns the single-flight (see
// lib/api/__tests__/client-401-refresh.test.ts); this owns "renew or sign out".

const mockRefresh = jest.fn();
const mockApiSignOut = jest.fn();
const mockMe = jest.fn();
jest.mock("@/features/auth/api", () => ({
  authApi: {
    refresh: (...a: unknown[]) => mockRefresh(...a),
    signOut: (...a: unknown[]) => mockApiSignOut(...a),
    me: () => mockMe(),
  },
  fetchCurrentUser: jest.fn(),
}));

const mockGetRefreshToken = jest.fn();
const mockGetAccessToken = jest.fn(async (): Promise<string | null> => null);
const mockSetAccessToken = jest.fn(async () => {});
const mockSetRefreshToken = jest.fn(async () => {});
const mockClearAll = jest.fn(async () => {});
const mockUnlock = jest.fn();
const mockEnable = jest.fn();
const mockDisable = jest.fn();
const mockOwner = jest.fn();
const mockLock = jest.fn();
const mockClearBiometric = jest.fn(async () => {});
jest.mock("@/lib/storage/secure-storage", () => ({
  secureStorage: {
    getAccessToken: () => mockGetAccessToken(),
    setAccessToken: (...a: unknown[]) => mockSetAccessToken(...(a as [])),
    getRefreshToken: () => mockGetRefreshToken(),
    setRefreshToken: (...a: unknown[]) => mockSetRefreshToken(...(a as [])),
    clearAll: () => mockClearAll(),
    clearBiometric: () => mockClearBiometric(),
    unlockBiometric: () => mockUnlock(),
    enableBiometric: (...args: unknown[]) => mockEnable(...args),
    disableBiometric: (...args: unknown[]) => mockDisable(...args),
    biometricOwner: () => mockOwner(),
    lockBiometric: () => mockLock(),
  },
}));

// Capture what the store registers with the api client instead of letting it
// mutate the real module.
//
// Parked on globalThis, not a module-scope `let`: the store's registration runs
// at IMPORT time, and ES imports are hoisted above every declaration in this
// file — so a `let x = null` initialiser would run *after* the store wrote to it
// and silently blank the capture.
type RefresherSlot = { __sessionRefresher?: () => Promise<boolean> };
jest.mock("@/lib/api/client", () => ({
  registerAuthTokenProvider: jest.fn(),
  registerDeviceIdProvider: jest.fn(),
  registerSessionRefresher: (fn: () => Promise<boolean>) => {
    (globalThis as RefresherSlot).__sessionRefresher = fn;
  },
}));

const sessionRefresher = () => {
  const fn = (globalThis as RefresherSlot).__sessionRefresher;
  if (!fn) throw new Error("auth-store did not register a session refresher");
  return fn();
};

jest.mock("@/lib/device/device-id", () => ({
  getDeviceId: jest.fn(async () => "device-1"),
  getDeviceIdCached: jest.fn(() => "device-1"),
}));

import { useAuthStore } from "../auth-store";
import type { User } from "@/types/user";
import { ApiError } from "@/types/api";
import { queryClient } from "@/lib/api/query-client";

const user: User = {
  id: "u1",
  email: "ama@example.com",
  displayName: "Ama Mensah",
  createdAt: new Date(0).toISOString(),
};

/** Lets the un-awaited revoke call start. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function signedIn() {
  useAuthStore.setState({ token: "access-1", user, isAuthenticated: true, isHydrating: false });
}

describe("signOut revokes the refresh token", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signedIn();
  });

  it("calls the logout endpoint with the stored refresh token, then clears", async () => {
    mockGetRefreshToken.mockResolvedValue("refresh-1");
    mockApiSignOut.mockResolvedValue(undefined);

    await useAuthStore.getState().signOut();
    await flush();

    expect(mockApiSignOut).toHaveBeenCalledWith("refresh-1");
    expect(mockClearAll).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  });

  it("reads the refresh token BEFORE clearing storage", async () => {
    // Clearing first would leave nothing to revoke — the original bug in a
    // different disguise.
    const order: string[] = [];
    mockGetRefreshToken.mockImplementation(async () => {
      order.push("read");
      return "refresh-1";
    });
    mockApiSignOut.mockImplementation(async () => {
      order.push("revoke");
    });
    mockClearAll.mockImplementation(async () => {
      order.push("clear");
    });

    await useAuthStore.getState().signOut();
    await flush();

    expect(order[0]).toBe("read");
    expect(order).toContain("revoke");
    expect(order).toContain("clear");
  });

  it("STILL signs out locally when the revoke throws", async () => {
    // Offline, backend down, 500 — none of it may keep a user signed in. That
    // failure mode is worse than the missed revocation.
    mockGetRefreshToken.mockResolvedValue("refresh-1");
    mockApiSignOut.mockRejectedValue(new Error("Network request failed"));

    await expect(useAuthStore.getState().signOut()).resolves.toBeUndefined();
    await flush();

    expect(mockClearAll).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("does not block on the network call", async () => {
    // A revoke that never settles must not hold the UI in a signed-in state.
    mockGetRefreshToken.mockResolvedValue("refresh-1");
    mockApiSignOut.mockImplementation(() => new Promise(() => {}));

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("skips the call when there is no stored refresh token", async () => {
    mockGetRefreshToken.mockResolvedValue(null);

    await useAuthStore.getState().signOut();
    await flush();

    expect(mockApiSignOut).not.toHaveBeenCalled();
    expect(mockClearAll).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("still clears when reading the refresh token throws", async () => {
    mockGetRefreshToken.mockRejectedValue(new Error("keystore2: UNKNOWN_ERROR"));

    await expect(useAuthStore.getState().signOut()).resolves.toBeUndefined();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(mockClearAll).toHaveBeenCalled();
  });

  it("clears the visible session before a slow credential read completes", async () => {
    const read = deferred<string | null>();
    mockGetRefreshToken.mockReturnValueOnce(read.promise);
    const signingOut = useAuthStore.getState().signOut();

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      isAuthenticated: false,
    });
    read.resolve(null);
    await signingOut;
  });

  it("still signs out locally when deleting stored credentials fails", async () => {
    mockGetRefreshToken.mockResolvedValue(null);
    mockClearAll.mockRejectedValueOnce(new Error("keystore unavailable"));

    await expect(useAuthStore.getState().signOut()).resolves.toBeUndefined();

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  });
});

describe("session refresher registered with the api client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signedIn();
  });

  it("is registered at module load", () => {
    expect((globalThis as RefresherSlot).__sessionRefresher).toEqual(expect.any(Function));
  });

  it("persists the ROTATED pair and reports success", async () => {
    // The backend rotates on every refresh; persisting only the access token
    // would leave the next renewal presenting a consumed refresh token.
    mockGetRefreshToken.mockResolvedValue("refresh-1");
    mockRefresh.mockResolvedValue({
      accessToken: "access-2",
      refreshToken: "refresh-2",
      user,
    });

    await expect(sessionRefresher()).resolves.toBe(true);

    expect(mockRefresh).toHaveBeenCalledWith(
      "refresh-1",
      expect.objectContaining({ onTokensRotated: expect.any(Function) }),
    );
    expect(mockSetAccessToken).toHaveBeenCalledWith("access-2");
    expect(mockSetRefreshToken).toHaveBeenCalledWith("refresh-2");
    expect(useAuthStore.getState().token).toBe("access-2");
  });

  it("signs the user out when the refresh fails", async () => {
    // This is what bounces the user to sign-in via the (app) route guard,
    // instead of holding them in an app where every request 401s.
    mockGetRefreshToken.mockResolvedValue("refresh-1");
    mockRefresh.mockRejectedValue(new ApiError("unauthorized", 401));

    await expect(sessionRefresher()).resolves.toBe(false);

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(mockClearAll).toHaveBeenCalled();
  });

  it("reports failure without a network call when nothing is stored", async () => {
    mockGetRefreshToken.mockResolvedValue(null);

    await expect(sessionRefresher()).resolves.toBe(false);

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe("session restoration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccessToken.mockResolvedValue("access-1");
    mockGetRefreshToken.mockResolvedValue("refresh-1");
    mockClearAll.mockResolvedValue(undefined);
    mockApiSignOut.mockResolvedValue(undefined);
    mockMe.mockReset();
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false, isHydrating: true });
  });

  it("retains the rotated token when the initial profile request refreshes the session", async () => {
    mockRefresh.mockResolvedValue({ accessToken: "access-2", refreshToken: "refresh-2", user });
    mockMe.mockImplementation(async () => {
      // The real client's 401 handler invokes this registered callback before
      // retrying /me. Its request/retry behavior is covered by client-401-refresh.
      expect(await sessionRefresher()).toBe(true);
      return user;
    });

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState()).toMatchObject({
      token: "access-2",
      user,
      isAuthenticated: true,
      isHydrating: false,
    });
    expect(mockSetAccessToken).toHaveBeenCalledWith("access-2");
    expect(mockSetRefreshToken).toHaveBeenCalledWith("refresh-2");
  });

  it("does not restore a profile response that arrives after sign-out", async () => {
    const profile = deferred<User>();
    mockMe.mockReturnValue(profile.promise);
    const hydrating = useAuthStore.getState().hydrate();
    await flush();
    expect(mockMe).toHaveBeenCalled();

    await useAuthStore.getState().signOut();
    profile.resolve(user);
    await hydrating;

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      isAuthenticated: false,
      isHydrating: false,
    });
  });

  it("does not clear a newer session when an old profile request fails", async () => {
    const profile = deferred<User>();
    mockMe.mockReturnValue(profile.promise);
    const hydrating = useAuthStore.getState().hydrate();
    await flush();
    expect(mockMe).toHaveBeenCalled();
    const nextUser = { ...user, id: "u2", email: "next@example.com" };

    await useAuthStore.getState().signIn("next-access", nextUser, "next-refresh");
    profile.reject(new Error("old profile request failed"));
    await hydrating;

    expect(useAuthStore.getState()).toMatchObject({
      token: "next-access",
      user: nextUser,
      isAuthenticated: true,
      isHydrating: false,
    });
    expect(mockClearAll).not.toHaveBeenCalled();
  });
});

describe("biometric enrollment and session lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRefreshToken.mockResolvedValue("refresh-1");
    mockSetAccessToken.mockResolvedValue(undefined);
    mockSetRefreshToken.mockResolvedValue(undefined);
    mockClearAll.mockResolvedValue(undefined);
    mockClearBiometric.mockResolvedValue(undefined);
    mockApiSignOut.mockResolvedValue(undefined);
    mockOwner.mockResolvedValue(user.id);
    mockEnable.mockResolvedValue(undefined);
    mockDisable.mockResolvedValue(undefined);
    mockUnlock.mockResolvedValue({ ownerId: user.id, refreshToken: "refresh-1" });
    mockRefresh.mockReset();
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
      isHydrating: false,
      revision: useAuthStore.getState().revision + 1,
    });
    queryClient.clear();
  });

  it("enables only the signed-in account and supplies a live session guard", async () => {
    signedIn();
    await useAuthStore.getState().enableBiometrics();
    expect(mockEnable).toHaveBeenCalledWith(user.id, expect.any(Function));
    const check = mockEnable.mock.calls[0][1] as () => boolean;
    expect(check()).toBe(true);
    await useAuthStore.getState().signOut();
    expect(check()).toBe(false);
  });

  it("requires a successful protected unlock before exchanging or installing credentials", async () => {
    const unlocking = deferred<{ ownerId: string; refreshToken: string }>();
    mockUnlock.mockReturnValueOnce(unlocking.promise);
    mockRefresh.mockResolvedValue({ accessToken: "access-2", refreshToken: "refresh-2", user });
    const operation = useAuthStore.getState().biometricSignIn();
    const repeated = useAuthStore.getState().biometricSignIn();
    await flush();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    unlocking.resolve({ ownerId: user.id, refreshToken: "refresh-1" });
    await operation;
    await repeated;
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledWith(
      "refresh-1",
      expect.objectContaining({ biometric: true }),
    );
    expect(useAuthStore.getState().token).toBe("access-2");
    expect(mockClearBiometric).not.toHaveBeenCalled();
  });

  it("cancelled or invalidated device authentication never calls the server", async () => {
    mockUnlock.mockRejectedValueOnce(new Error("Device authentication cancelled"));
    await expect(useAuthStore.getState().biometricSignIn()).rejects.toThrow();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockClearAll).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("persists a rotated credential even when the subsequent profile read is offline", async () => {
    mockRefresh.mockImplementation(async (_token, options) => {
      await options.onTokensRotated({ accessToken: "access-2", refreshToken: "refresh-2" });
      throw new ApiError("offline reading profile", 0);
    });
    await expect(useAuthStore.getState().biometricSignIn()).rejects.toMatchObject({ status: 0 });
    expect(mockSetRefreshToken).toHaveBeenCalledWith("refresh-2");
    expect(mockClearAll).not.toHaveBeenCalled();
    expect(mockLock).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("removes rejected server credentials and requires a fresh password sign-in", async () => {
    mockRefresh.mockRejectedValue(new ApiError("revoked", 401));
    await expect(useAuthStore.getState().biometricSignIn()).rejects.toMatchObject({ status: 401 });
    expect(mockClearAll).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("a late device prompt cannot overwrite a newer password sign-in", async () => {
    const unlocking = deferred<{ ownerId: string; refreshToken: string }>();
    mockUnlock.mockReturnValueOnce(unlocking.promise);
    const oldAttempt = useAuthStore.getState().biometricSignIn();
    const oldRejected = expect(oldAttempt).rejects.toThrow("session changed");
    await flush();
    const nextUser = { ...user, id: "patient-b" };
    const newSignIn = useAuthStore.getState().signIn("new-access", nextUser, "new-refresh");
    unlocking.resolve({ ownerId: user.id, refreshToken: "refresh-1" });
    await oldRejected;
    await newSignIn;
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.id).toBe("patient-b");
    expect(mockClearBiometric).toHaveBeenCalled();
  });

  it("locking during rotation hides the account immediately and saves the successor before dropping the key", async () => {
    signedIn();
    const rotating = deferred<{ accessToken: string; refreshToken: string; user: User }>();
    let save!: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
    mockRefresh.mockImplementation((_token, options) => {
      save = options.onTokensRotated;
      return rotating.promise;
    });
    queryClient.setQueryData(["private-patient-data"], "private");
    const renewal = sessionRefresher();
    await flush();
    const locking = useAuthStore.getState().lock();
    await flush();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(queryClient.getQueryData(["private-patient-data"])).toBeUndefined();
    expect(mockLock).not.toHaveBeenCalled();
    await save({ accessToken: "access-2", refreshToken: "refresh-2" });
    rotating.resolve({ accessToken: "access-2", refreshToken: "refresh-2", user });
    await renewal;
    await locking;
    expect(mockSetRefreshToken).toHaveBeenCalledWith("refresh-2");
    expect(mockLock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("cannot silently renew after sign-out even if a credential read could still return a value", async () => {
    await expect(sessionRefresher()).resolves.toBe(false);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("a partial sign-in storage failure clears both visible and persisted credentials", async () => {
    signedIn();
    mockSetRefreshToken.mockRejectedValueOnce(new Error("keystore write failed"));
    await expect(
      useAuthStore.getState().signIn("new-access", user, "new-refresh"),
    ).rejects.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(mockClearAll).toHaveBeenCalled();
    expect(mockApiSignOut).toHaveBeenCalledWith("new-refresh");
  });
});

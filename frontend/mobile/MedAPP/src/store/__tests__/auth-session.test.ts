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
jest.mock("@/features/auth/api", () => ({
  authApi: {
    refresh: (...a: unknown[]) => mockRefresh(...a),
    signOut: (...a: unknown[]) => mockApiSignOut(...a),
  },
  fetchCurrentUser: jest.fn(),
}));

const mockGetRefreshToken = jest.fn();
const mockSetAccessToken = jest.fn(async () => {});
const mockSetRefreshToken = jest.fn(async () => {});
const mockClearAll = jest.fn(async () => {});
jest.mock("@/lib/storage/secure-storage", () => ({
  secureStorage: {
    getAccessToken: jest.fn(async () => null),
    setAccessToken: (...a: unknown[]) => mockSetAccessToken(...(a as [])),
    getRefreshToken: () => mockGetRefreshToken(),
    setRefreshToken: (...a: unknown[]) => mockSetRefreshToken(...(a as [])),
    clearAll: () => mockClearAll(),
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

const user: User = {
  id: "u1",
  email: "ama@example.com",
  displayName: "Ama Mensah",
  createdAt: new Date(0).toISOString(),
};

/** Lets the un-awaited revoke call start. */
const flush = () => new Promise((r) => setTimeout(r, 0));

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

    expect(mockRefresh).toHaveBeenCalledWith("refresh-1");
    expect(mockSetAccessToken).toHaveBeenCalledWith("access-2");
    expect(mockSetRefreshToken).toHaveBeenCalledWith("refresh-2");
    expect(useAuthStore.getState().token).toBe("access-2");
  });

  it("signs the user out when the refresh fails", async () => {
    // This is what bounces the user to sign-in via the (app) route guard,
    // instead of holding them in an app where every request 401s.
    mockGetRefreshToken.mockResolvedValue("refresh-1");
    mockRefresh.mockRejectedValue(new Error("401"));

    await expect(sessionRefresher()).resolves.toBe(false);

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(mockClearAll).toHaveBeenCalled();
  });

  it("reports failure without a network call when nothing is stored", async () => {
    mockGetRefreshToken.mockResolvedValue(null);

    await expect(sessionRefresher()).resolves.toBe(false);

    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

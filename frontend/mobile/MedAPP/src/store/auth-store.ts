import { create } from "zustand";
import { secureStorage } from "@/lib/storage/secure-storage";
import {
  registerAuthTokenProvider,
  registerDeviceIdProvider,
  registerSessionRefresher,
} from "@/lib/api/client";
import { getDeviceId, getDeviceIdCached } from "@/lib/device/device-id";
import { authApi } from "@/features/auth/api";
import type { User } from "@/types/user";

// Global auth state.
//
// - `hydrate()` runs once on app start. Reads the token from SecureStore and,
//   if present, fetches the current user from the backend to confirm it's
//   still valid. Falls back to signed-out state on any error.
// - `signIn`/`signOut` mutate the token in SecureStore and update state.
// - The API client reads the current token, the device id, and the session
//   refresher via registered providers so it doesn't have to import this module
//   (avoiding a cycle). The dependency runs one way only:
//   auth-store -> features/auth/api -> lib/api/client.
//
// `@/features/auth/api` is imported statically. It used to be lazily
// `import()`ed here "to keep auth feature code out of this module's graph", but
// that graph is `api.ts -> client.ts`, which this module already imports — the
// lazy form bought nothing and cost testability: Jest runs without
// `--experimental-vm-modules`, so a dynamic import THROWS inside every test that
// reaches it, and the surrounding catch swallowed it as an ordinary failure.

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  hydrate: () => Promise<void>;
  signIn: (token: string, user: User, refreshToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isHydrating: true,

  hydrate: async () => {
    try {
      // Warm the device-id cache before any request fires. The api
      // client's X-Device-Id provider reads the synchronous cache;
      // priming it here means even the /me probe below carries the
      // header. New installs generate + persist a fresh id on this
      // call.
      await getDeviceId();

      const token = await secureStorage.getAccessToken();
      if (!token) {
        set({ token: null, user: null, isAuthenticated: false, isHydrating: false });
        return;
      }
      // Token is present. Set it provisionally so the registered provider
      // returns it for the /me request below.
      set({ token });
      try {
        const user = await authApi.me();
        set({ token, user, isAuthenticated: true, isHydrating: false });
      } catch {
        await secureStorage.clearAll();
        set({ token: null, user: null, isAuthenticated: false, isHydrating: false });
      }
    } catch {
      set({ token: null, user: null, isAuthenticated: false });
    } finally {
      // FINALLY, so no future edit can add a path that leaves this true. The
      // root layout paints nothing while it is, so a stuck flag is a blank app
      // rather than a degraded one. Every branch above already cleared it; this
      // makes that a property of the function instead of a habit.
      set({ isHydrating: false });
    }
  },

  signIn: async (token, user, refreshToken) => {
    await secureStorage.setAccessToken(token);
    if (refreshToken) await secureStorage.setRefreshToken(refreshToken);
    set({ token, user, isAuthenticated: true });
  },

  signOut: async () => {
    // Revoke server-side before the token is gone locally. `authApi.signOut`
    // had ZERO callers, so "sign out" only ever deleted the local copy — the
    // refresh token stayed valid on the backend and anyone holding it (a
    // device backup, a shared phone's next user via a restored keychain) could
    // still mint access tokens for an account the user believed was closed.
    // A keystore fault must not abort the sign-out (see
    // store/__tests__/hydration-gate.test.ts for the device failure that
    // taught us storage reads throw).
    const refreshToken = await secureStorage.getRefreshToken().catch(() => null);

    // Deliberately NOT awaited. Local sign-out must be immediate and
    // unconditional: on a flaky network awaiting this would freeze the UI for
    // the fetch timeout, and a rejection must never leave the user signed in —
    // that failure mode is worse than the missed revoke. So we fire it, swallow
    // the outcome, and clear regardless. Revocation is best-effort; the backend
    // expires the token on its own schedule anyway.
    if (refreshToken) {
      void authApi.signOut(refreshToken).catch(() => {});
    }

    await secureStorage.clearAll();
    set({ token: null, user: null, isAuthenticated: false });
  },

  setUser: (user) => set({ user }),
}));

// Register the token getter so lib/api/client.ts can attach Authorization
// without importing this store (which would be a cycle).
registerAuthTokenProvider(() => useAuthStore.getState().token);
// Same pattern for X-Device-Id. The cached accessor is synchronous; if
// the cache is empty (race before hydrate finishes), the header is
// dropped from that one request — backend handles it as the legacy
// path.
registerDeviceIdProvider(() => getDeviceIdCached());

// Third injection of the same shape: the client asks us to renew the session
// when a request 401s, and we answer true/false. The client can't do this
// itself — it would have to import `@/features/auth/api`, which imports the
// client.
//
// The client owns the single-flight; this only has to be correct once.
registerSessionRefresher(async () => {
  const refreshToken = await secureStorage.getRefreshToken().catch(() => null);
  // No refresh token (signed out, or a session that never stored one). The
  // 401 stands and the caller sees it.
  if (!refreshToken) return false;
  try {
    const r = await authApi.refresh(refreshToken);
    // The backend rotates on every refresh — persist the NEW refresh token or
    // the next renewal presents a consumed one.
    await useAuthStore.getState().signIn(r.accessToken, r.user, r.refreshToken);
    return true;
  } catch {
    // Expired, revoked, or rotated out from under us. Sign out so the (app)
    // guard sends the user to sign-in instead of holding them in a dead
    // session. Note this does NOT recurse: `authApi.refresh` is withAuth:false,
    // so its own 401 never re-enters the client's refresh path.
    await useAuthStore.getState().signOut();
    return false;
  }
});

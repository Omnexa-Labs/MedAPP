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
import { ApiError } from "@/types/api";
import { queryClient } from "@/lib/api/query-client";

// Native prompts may take seconds. Serialize credential mutations while a
// revision invalidates old work immediately when the user locks or signs out.
let writes: Promise<unknown> = Promise.resolve();
let activeRenewal: Promise<boolean> | null = null;
let lockSettling: Promise<void> | null = null;
let lockingRevision: number | null = null;
let biometricAttempt: Promise<void> | null = null;
function storeTask<T>(work: () => Promise<T>): Promise<T> {
  const result = writes.then(work, work);
  writes = result.catch(() => {});
  return result;
}
export class AuthSessionChanged extends Error {
  constructor() {
    super("The sign-in session changed");
    this.name = "AuthSessionChanged";
  }
}

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
  revision: number;
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  hydrate: () => Promise<void>;
  signIn: (
    token: string,
    user: User,
    refreshToken?: string,
    mode?: "password" | "biometric" | "refresh",
  ) => Promise<void>;
  signOut: () => Promise<void>;
  enableBiometrics: () => Promise<void>;
  disableBiometrics: () => Promise<void>;
  biometricSignIn: () => Promise<void>;
  lock: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  revision: 0,
  token: null,
  user: null,
  isAuthenticated: false,
  isHydrating: true,

  hydrate: async () => {
    const revision = get().revision;
    try {
      // Warm the device-id cache before any request fires. The api
      // client's X-Device-Id provider reads the synchronous cache;
      // priming it here means even the /me probe below carries the
      // header. New installs generate + persist a fresh id on this
      // call.
      await getDeviceId();

      const token = await secureStorage.getAccessToken();
      if (get().revision !== revision) return;
      if (!token) {
        set({ token: null, user: null, isAuthenticated: false, isHydrating: false });
        return;
      }
      // Token is present. Set it provisionally so the registered provider
      // returns it for the /me request below.
      set({ token });
      try {
        const user = await authApi.me();
        // /me may have refreshed and installed a new session while we awaited
        // it. Only finish the session we started; never overwrite that rotated
        // token, a later sign-in, or a sign-out with this older response.
        if (get().revision === revision && get().token === token) {
          set({ user, isAuthenticated: true, isHydrating: false });
        }
      } catch {
        if (get().revision === revision && get().token === token) await get().signOut();
      }
    } catch {
      if (get().revision === revision) set({ token: null, user: null, isAuthenticated: false });
    } finally {
      // FINALLY, so no future edit can add a path that leaves this true. The
      // root layout paints nothing while it is, so a stuck flag is a blank app
      // rather than a degraded one. Every branch above already cleared it; this
      // makes that a property of the function instead of a habit.
      set({ isHydrating: false });
    }
  },

  signIn: async (token, user, refreshToken, mode = "password") => {
    const revision = get().revision + (mode === "refresh" ? 0 : 1);
    if (mode === "refresh") set({ revision });
    else {
      set({ revision, token: null, user: null, isAuthenticated: false });
      queryClient.clear();
    }
    await storeTask(async () => {
      if (get().revision !== revision) throw new AuthSessionChanged();
      try {
        if (mode === "password") await secureStorage.clearBiometric();
        await secureStorage.setAccessToken(token);
        if (refreshToken) await secureStorage.setRefreshToken(refreshToken);
        else await secureStorage.clearRefreshToken();
        if (get().revision !== revision) throw new AuthSessionChanged();
        if (mode !== "refresh") queryClient.clear();
        set({ token, user, isAuthenticated: true });
      } catch (error) {
        // No partial access/refresh pair may restore itself on the next launch.
        await secureStorage.clearAll().catch(() => {});
        if (refreshToken) void authApi.signOut(refreshToken).catch(() => {});
        if (get().revision === revision) {
          set({ token: null, user: null, isAuthenticated: false });
          queryClient.clear();
        }
        throw error;
      }
    });
  },

  signOut: async () => {
    // Remove authenticated content before waiting for the device or network.
    set({ token: null, user: null, isAuthenticated: false, revision: get().revision + 1 });
    queryClient.clear();
    // Revoke server-side before the token is gone locally. `authApi.signOut`
    // had ZERO callers, so "sign out" only ever deleted the local copy — the
    // refresh token stayed valid on the backend and anyone holding it (a
    // device backup, a shared phone's next user via a restored keychain) could
    // still mint access tokens for an account the user believed was closed.
    // A keystore fault must not abort the sign-out (see
    // store/__tests__/hydration-gate.test.ts for the device failure that
    // taught us storage reads throw).
    await storeTask(async () => {
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

      // A keystore failure must not restore the visible session or turn an
      // un-awaited sign-out action into an unhandled rejection. Deletion and
      // server revocation remain best-effort when the device/network fails.
      await secureStorage.clearAll().catch(() => {});
    });
  },

  enableBiometrics: async () => {
    const { revision, user, isAuthenticated } = get();
    if (!user || !isAuthenticated) throw new AuthSessionChanged();
    await storeTask(() =>
      secureStorage.enableBiometric(
        user.id,
        () => get().revision === revision && get().isAuthenticated,
      ),
    );
  },
  disableBiometrics: async () => {
    const { revision, token, isAuthenticated } = get();
    if (!token || !isAuthenticated) throw new AuthSessionChanged();
    await storeTask(async () => {
      if (get().revision !== revision) throw new AuthSessionChanged();
      await secureStorage.disableBiometric(token);
    });
  },
  lock: async () => {
    const { revision, user } = get();
    if (!user || (await secureStorage.biometricOwner()) !== user.id || get().revision !== revision)
      return;
    lockingRevision = revision;
    set({ token: null, user: null, isAuthenticated: false, revision: revision + 1 });
    queryClient.clear();
    // Hide immediately, but let an already-issued rotation save its successor
    // before dropping the in-memory key. Otherwise the next unlock reuses a
    // consumed token. New unlock attempts wait for this short settlement.
    const pending = activeRenewal;
    const finishing = (async () => {
      await pending;
      if (get().revision === revision + 1) secureStorage.lockBiometric();
      if (lockingRevision === revision) lockingRevision = null;
    })();
    lockSettling = finishing;
    try {
      await finishing;
    } finally {
      if (lockSettling === finishing) lockSettling = null;
    }
  },
  biometricSignIn: () => {
    if (biometricAttempt) return biometricAttempt;
    const operation = (async () => {
      await lockSettling;
      const revision = get().revision;
      if (get().isAuthenticated) throw new AuthSessionChanged();
      const assertCurrent = () => {
        if (get().revision !== revision) throw new AuthSessionChanged();
      };
      try {
        const credential = await storeTask(async () => {
          assertCurrent();
          const result = await secureStorage.unlockBiometric();
          if (get().revision !== revision) {
            secureStorage.lockBiometric();
            throw new AuthSessionChanged();
          }
          return result;
        });
        assertCurrent();
        const response = await authApi.refresh(credential.refreshToken, {
          biometric: true,
          onTokensRotated: async (tokens) => {
            await storeTask(async () => {
              assertCurrent();
              try {
                await secureStorage.setRefreshToken(tokens.refreshToken);
              } catch (error) {
                void authApi.signOut(tokens.refreshToken).catch(() => {});
                await secureStorage.clearAll().catch(() => {});
                throw error;
              }
            });
          },
        });
        assertCurrent();
        if (response.user.id !== credential.ownerId) {
          await get().signOut();
          throw new AuthSessionChanged();
        }
        await get().signIn(response.accessToken, response.user, response.refreshToken, "biometric");
      } catch (error) {
        if (get().revision === revision) {
          if (error instanceof ApiError && error.isUnauthorized) await get().signOut();
          else secureStorage.lockBiometric();
        }
        throw error;
      }
    })().finally(() => {
      if (biometricAttempt === operation) biometricAttempt = null;
    });
    biometricAttempt = operation;
    return operation;
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
async function renewSession(): Promise<boolean> {
  const revision = useAuthStore.getState().revision;
  if (!useAuthStore.getState().token) return false;
  const refreshToken = await secureStorage.getRefreshToken().catch(() => null);
  // No refresh token (signed out, or a session that never stored one). The
  // 401 stands and the caller sees it.
  if (useAuthStore.getState().revision !== revision) return false;
  if (!refreshToken) {
    await useAuthStore.getState().signOut();
    return false;
  }
  let credentialsLost = false;
  try {
    const r = await authApi.refresh(refreshToken, {
      onTokensRotated: (tokens) =>
        storeTask(async () => {
          const current = useAuthStore.getState().revision;
          if (current !== revision && !(lockingRevision === revision && current === revision + 1))
            throw new AuthSessionChanged();
          try {
            await secureStorage.setRefreshToken(tokens.refreshToken);
          } catch (error) {
            credentialsLost = true;
            void authApi.signOut(tokens.refreshToken).catch(() => {});
            throw error;
          }
        }),
    });
    // The backend rotates on every refresh — persist the NEW refresh token or
    // the next renewal presents a consumed one.
    if (useAuthStore.getState().revision !== revision) return false;
    await useAuthStore.getState().signIn(r.accessToken, r.user, r.refreshToken, "refresh");
    return true;
  } catch (error) {
    // Expired, revoked, or rotated out from under us. Sign out so the (app)
    // guard sends the user to sign-in instead of holding them in a dead
    // session. Note this does NOT recurse: `authApi.refresh` is withAuth:false,
    // so its own 401 never re-enters the client's refresh path.
    if (
      useAuthStore.getState().revision === revision &&
      (credentialsLost || (error instanceof ApiError && error.isUnauthorized))
    ) {
      await useAuthStore.getState().signOut();
    } else if (
      lockingRevision === revision &&
      useAuthStore.getState().revision === revision + 1 &&
      (credentialsLost || (error instanceof ApiError && error.isUnauthorized))
    ) {
      await storeTask(() => secureStorage.clearAll().catch(() => {}));
    }
    return false;
  }
}

registerSessionRefresher(() => {
  if (activeRenewal) return activeRenewal;
  const operation = renewSession().finally(() => {
    if (activeRenewal === operation) activeRenewal = null;
  });
  activeRenewal = operation;
  return operation;
});

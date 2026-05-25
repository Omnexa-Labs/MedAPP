import { create } from "zustand";
import { secureStorage } from "@/lib/storage/secure-storage";
import { registerAuthTokenProvider, registerDeviceIdProvider } from "@/lib/api/client";
import { getDeviceId, getDeviceIdCached } from "@/lib/device/device-id";
import type { User } from "@/types/user";

// Global auth state.
//
// - `hydrate()` runs once on app start. Reads the token from SecureStore and,
//   if present, fetches the current user from the backend to confirm it's
//   still valid. Falls back to signed-out state on any error.
// - `signIn`/`signOut` mutate the token in SecureStore and update state.
// - The API client reads the current token via a registered provider so it
//   doesn't have to import this module (avoiding a cycle).

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
        // Lazy import to avoid pulling auth feature code into this module's
        // dependency graph. Each feature owns its own /me call.
        const { fetchCurrentUser } = await import("@/features/auth/api");
        const user = await fetchCurrentUser();
        set({ token, user, isAuthenticated: true, isHydrating: false });
      } catch {
        await secureStorage.clearAll();
        set({ token: null, user: null, isAuthenticated: false, isHydrating: false });
      }
    } catch {
      set({ token: null, user: null, isAuthenticated: false, isHydrating: false });
    }
  },

  signIn: async (token, user, refreshToken) => {
    await secureStorage.setAccessToken(token);
    if (refreshToken) await secureStorage.setRefreshToken(refreshToken);
    set({ token, user, isAuthenticated: true });
  },

  signOut: async () => {
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

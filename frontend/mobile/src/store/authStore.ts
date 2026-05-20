import { create } from "zustand";
import { secureStorage } from "@/core/storage/secureStorage";
import { authRepository } from "@/features/auth/authRepository";
import type { AuthUser } from "@/features/auth/types";

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isHydrating: true,
  hydrate: async () => {
    const token = await secureStorage.getToken();
    if (!token) {
      set({ token: null, user: null, isAuthenticated: false, isHydrating: false });
      return;
    }
    try {
      const user = await authRepository.me();
      set({ token, user, isAuthenticated: true, isHydrating: false });
    } catch {
      await secureStorage.clearToken();
      set({ token: null, user: null, isAuthenticated: false, isHydrating: false });
    }
  },
  login: async (email, password) => {
    const { accessToken, user } = await authRepository.login(email, password);
    await secureStorage.setToken(accessToken);
    set({ token: accessToken, user, isAuthenticated: true });
  },
  signOut: async () => {
    await secureStorage.clearToken();
    await secureStorage.clearRefreshToken();
    set({ token: null, user: null, isAuthenticated: false });
  },
}));

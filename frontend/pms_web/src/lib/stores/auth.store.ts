import { create } from "zustand";
import apiClient from "@/lib/api/client";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string; // pharmacy_admin | pharmacist | cashier
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  hydrate: () => void;
  login: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isHydrating: true,

  hydrate: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("pms_token");
    const userJson = localStorage.getItem("pms_user");
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as AuthUser;
        set({ token, user, isAuthenticated: true, isHydrating: false });
        return;
      } catch {
        // fall through
      }
    }
    set({ isHydrating: false });
  },

  login: async (email, password) => {
    const res = await apiClient.post("/v1/auth/login", { email, password });
    const { access_token, user } = res.data;
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    };
    localStorage.setItem("pms_token", access_token);
    localStorage.setItem("pms_user", JSON.stringify(authUser));
    set({ token: access_token, user: authUser, isAuthenticated: true });
  },

  signOut: () => {
    localStorage.removeItem("pms_token");
    localStorage.removeItem("pms_user");
    set({ token: null, user: null, isAuthenticated: false });
  },
}));

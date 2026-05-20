import { create } from "zustand";
import apiClient from "@/lib/api/client";

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  hospitalId: string;
  hmsRole: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  hydrate: () => void;
  login: (email: string, password: string) => Promise<void>;
  setToken: (token: string) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isHydrating: true,

  hydrate: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("hms_token");
    const userJson = localStorage.getItem("hms_user");
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as AuthUser;
        set({ token, user, isAuthenticated: true, isHydrating: false });
      } catch {
        set({ isHydrating: false });
      }
    } else {
      set({ isHydrating: false });
    }
  },

  login: async (email: string, password: string) => {
    const response = await apiClient.post("/v1/auth/login", { email, password });
    const { access_token, user } = response.data;
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      hospitalId: user.hospital_id,
      hmsRole: user.hms_role,
    };
    localStorage.setItem("hms_token", access_token);
    localStorage.setItem("hms_user", JSON.stringify(authUser));
    set({ token: access_token, user: authUser, isAuthenticated: true });
  },

  setToken: (token: string) => {
    localStorage.setItem("hms_token", token);
    set({ token, isAuthenticated: true });
  },

  signOut: () => {
    localStorage.removeItem("hms_token");
    localStorage.removeItem("hms_user");
    localStorage.removeItem("hms_tenant_config");
    set({ token: null, user: null, isAuthenticated: false });
  },
}));

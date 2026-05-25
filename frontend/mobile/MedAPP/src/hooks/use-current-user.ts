import { useAuthStore } from "@/store/auth-store";
import type { User } from "@/types/user";

/** Reactive selector for the current authenticated user, or null. */
export function useCurrentUser(): User | null {
  return useAuthStore((s) => s.user);
}

/** Reactive selector for `isAuthenticated`. */
export function useIsAuthenticated(): boolean {
  return useAuthStore((s) => s.isAuthenticated);
}

import { useMutation } from "@tanstack/react-query";
import { authApi, type LoginPayload } from "@/features/auth/api";
import { useAuthStore } from "@/store/auth-store";

// useMutation wrapping the login endpoint.
// On success: persists token via authStore.signIn (which writes SecureStore
// and flips isAuthenticated). The root layout then re-renders into the
// authenticated route group.
export function useLogin() {
  const signIn = useAuthStore((s) => s.signIn);
  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: async ({ accessToken, refreshToken, user }) => {
      await signIn(accessToken, user, refreshToken);
    },
  });
}

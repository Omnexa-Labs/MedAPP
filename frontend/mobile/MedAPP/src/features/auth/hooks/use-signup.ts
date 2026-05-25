import { useMutation } from "@tanstack/react-query";
import { authApi, type SignUpFullPayload } from "@/features/auth/api";
import { useAuthStore } from "@/store/auth-store";

// useMutation wrapping the multi-step sign-up endpoint.
// On success: same path as login — persists token via authStore.signIn, which
// flips isAuthenticated so the root layout swaps into the (app) route group.
export function useSignUp() {
  const signIn = useAuthStore((s) => s.signIn);
  return useMutation({
    mutationFn: (payload: SignUpFullPayload) => authApi.signUpFull(payload),
    onSuccess: async ({ accessToken, refreshToken, user }) => {
      await signIn(accessToken, user, refreshToken);
    },
  });
}

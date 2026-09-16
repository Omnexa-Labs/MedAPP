import { useMutation } from "@tanstack/react-query";
import { authApi, SignupSignInError, type SignUpFullPayload } from "@/features/auth/api";
import { useAuthStore } from "@/store/auth-store";

// useMutation wrapping the multi-step sign-up endpoint.
// On success: same path as login — persists token via authStore.signIn, which
// flips isAuthenticated so the root layout swaps into the (app) route group.
export function useSignUp() {
  const signIn = useAuthStore((s) => s.signIn);
  return useMutation({
    mutationFn: async (payload: SignUpFullPayload) => {
      const revision = useAuthStore.getState().revision;
      return { ...(await authApi.signUpFull(payload)), revision };
    },
    onSuccess: async ({ accessToken, refreshToken, user, revision }) => {
      try {
        if (useAuthStore.getState().revision !== revision) throw new SignupSignInError();
        await signIn(accessToken, user, refreshToken);
      } catch {
        throw new SignupSignInError();
      }
    },
  });
}

import { useMutation } from "@tanstack/react-query";
import { authApi, type LoginPayload } from "@/features/auth/api";
import { AuthSessionChanged, useAuthStore } from "@/store/auth-store";

// useMutation wrapping the login endpoint.
// On success: persists token via authStore.signIn (which writes SecureStore
// and flips isAuthenticated). The root layout then re-renders into the
// authenticated route group.
export function useLogin() {
  const signIn = useAuthStore((s) => s.signIn);
  return useMutation({
    gcTime: 0,
    mutationFn: async (payload: LoginPayload) => {
      const revision = useAuthStore.getState().revision;
      let response;
      try {
        response = await authApi.login(payload);
      } catch (error) {
        if (useAuthStore.getState().revision !== revision) throw new AuthSessionChanged();
        throw error;
      }
      if (useAuthStore.getState().revision !== revision) throw new AuthSessionChanged();
      const { accessToken, refreshToken, user } = response;
      await signIn(accessToken, user, refreshToken);
      return response;
    },
  });
}

import { useCallback } from "react";
import { useAuthStore } from "@/store/auth-store";

/** Bind private queries and retries to the account that opened the screen. */
export function useSessionScope() {
  const user = useAuthStore((state) => state.user);
  const revision = useAuthStore((state) => state.revision);
  const owner = user?.id;
  const isCurrent = useCallback(() => {
    const current = useAuthStore.getState();
    return (
      !!owner &&
      current.isAuthenticated &&
      current.user?.id === owner &&
      current.revision === revision
    );
  }, [owner, revision]);
  return { user, owner, revision, isCurrent };
}

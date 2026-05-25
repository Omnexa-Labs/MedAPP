import type { ReactNode } from "react";
import { useIsAuthenticated } from "@/hooks/use-current-user";

interface Props {
  children: ReactNode;
  /** What to render when the user is signed out. Default: nothing. */
  fallback?: ReactNode;
}

/**
 * Renders `children` only if the user is signed in.
 * For route-level redirects, prefer `<Redirect>` in an Expo Router layout.
 */
export function RequireAuth({ children, fallback = null }: Props) {
  const authed = useIsAuthenticated();
  return authed ? <>{children}</> : <>{fallback}</>;
}

import type { ReactNode } from "react";
import { useRole } from "@/hooks/use-role";

interface Props {
  children: ReactNode;
  /**
   * Rendered when the user is signed in but NOT yet an approved partner.
   * Typically a "Become a Partner" CTA. Default: nothing.
   */
  fallback?: ReactNode;
  /**
   * Rendered while the partner application is `pending`. If omitted, falls
   * through to `fallback`.
   */
  pendingFallback?: ReactNode;
}

/** Gates content to approved partners only. */
export function RequirePartner({ children, fallback = null, pendingFallback }: Props) {
  const { isPartner, isPartnerPending } = useRole();
  if (isPartner) return <>{children}</>;
  if (isPartnerPending && pendingFallback !== undefined) return <>{pendingFallback}</>;
  return <>{fallback}</>;
}

import type { ReactNode } from "react";
import { useCapability } from "@/hooks/use-capability";
import type { Capability } from "@/constants/capabilities";

interface Props {
  capability: Capability;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders `children` only when the current user has the named capability.
 * Prefer this over `<RoleGate>` for action-level gating ("can publish a
 * blog post") — it keeps roles → capabilities centralized in
 * `constants/capabilities.ts`.
 */
export function RequireCapability({ capability, children, fallback = null }: Props) {
  return useCapability(capability) ? <>{children}</> : <>{fallback}</>;
}

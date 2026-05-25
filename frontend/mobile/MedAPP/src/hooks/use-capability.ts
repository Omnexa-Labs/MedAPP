import { useRole } from "@/hooks/use-role";
import { hasCapability, type Capability } from "@/constants/capabilities";

/** Returns whether the current user has the named capability. */
export function useCapability(capability: Capability): boolean {
  const { role, partnerKind } = useRole();
  return hasCapability(capability, { role, partnerKind });
}

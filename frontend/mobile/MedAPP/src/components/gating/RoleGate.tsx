import type { ReactNode } from "react";
import { useRole } from "@/hooks/use-role";
import type { PartnerKind, Role } from "@/types/user";

interface Props {
  /** A single role, or multiple roles to allow. */
  role: Role | Role[];
  /** Optional: further narrow to a specific partner kind when role is "partner". */
  partnerKind?: PartnerKind | PartnerKind[];
  children: ReactNode;
  fallback?: ReactNode;
}

/** Renders `children` only when the current user matches the role (and optional kind). */
export function RoleGate({ role, partnerKind, children, fallback = null }: Props) {
  const { role: currentRole, partnerKind: currentKind } = useRole();

  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(currentRole)) return <>{fallback}</>;

  if (partnerKind && currentRole === "partner") {
    const kinds = Array.isArray(partnerKind) ? partnerKind : [partnerKind];
    if (!currentKind || !kinds.includes(currentKind)) return <>{fallback}</>;
  }

  return <>{children}</>;
}

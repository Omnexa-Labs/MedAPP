import { useAuthStore } from "@/store/auth-store";
import { roleOf, type PartnerKind, type PartnerStatus, type Role } from "@/types/user";

interface RoleInfo {
  role: Role;
  partnerKind: PartnerKind | undefined;
  partnerStatus: PartnerStatus;
  isPartner: boolean;
  isPartnerPending: boolean;
}

/** Reactive role + partner-status info for the current user. */
export function useRole(): RoleInfo {
  const user = useAuthStore((s) => s.user);
  const role = roleOf(user);
  const partnerStatus: PartnerStatus = user?.partner?.status ?? "none";
  return {
    role,
    partnerKind: user?.partner?.kind,
    partnerStatus,
    isPartner: role === "partner",
    isPartnerPending: partnerStatus === "pending",
  };
}

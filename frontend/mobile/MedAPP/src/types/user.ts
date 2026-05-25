// Core identity + role types.
//
// "Partner" is an upgraded role earned through web onboarding. A signed-in user
// without partner status is a regular "user". Guests are unauthenticated.
//
// PartnerKind distinguishes between partner sub-types — a practitioner has
// different capabilities than a pharmacy or a hospital admin.

export type Role = "guest" | "user" | "partner";

export type PartnerKind = "practitioner" | "pharmacy" | "hospital";

export type PartnerStatus = "none" | "pending" | "approved" | "rejected";

export interface Partner {
  kind: PartnerKind;
  status: PartnerStatus;
  appliedAt?: string;
  approvedAt?: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  partner?: Partner;
  createdAt: string;
}

export function roleOf(user: User | null): Role {
  if (!user) return "guest";
  if (user.partner?.status === "approved") return "partner";
  return "user";
}

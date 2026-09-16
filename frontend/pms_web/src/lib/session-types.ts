export const pmsRoles = ["pharmacy_admin", "pharmacist", "cashier"] as const;
export interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: (typeof pmsRoles)[number];
}
export interface Pharmacy {
  id: string | null;
  name: string;
  deployment_key: string | null;
}
export interface Identity {
  returnAvailable?: boolean;
  scope: string;
  user: StaffUser;
  pharmacy: Pharmacy;
  mode: "medapp" | "local";
}
export interface Challenge {
  mfa_required: true;
  scope: string;
  expires_in: number;
}

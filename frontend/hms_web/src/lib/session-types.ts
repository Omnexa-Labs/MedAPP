export const hmsRoles = [
  "hospital_admin",
  "department_head",
  "doctor",
  "nurse",
  "pharmacist",
  "billing_clerk",
  "receptionist",
  "lab_tech",
] as const;
export type HmsRole = (typeof hmsRoles)[number];
export interface Workspace {
  hospital_id: string;
  hospital_name: string;
  hms_role: HmsRole;
}
export interface WebUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}
export interface Identity {
  user: WebUser;
  scope: string;
  workspace: Workspace | null;
  workspaces: Workspace[];
  returnAvailable?: boolean;
}

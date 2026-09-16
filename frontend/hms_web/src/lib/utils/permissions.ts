const MODULE_ROLES: Record<string, string[]> = {
  "hospital-profile": ["hospital_admin"],
  patients: ["hospital_admin", "receptionist", "doctor", "nurse"],
  staff: ["hospital_admin", "department_head"],
  appointments: ["hospital_admin", "receptionist", "doctor", "nurse"],
  queue: ["hospital_admin", "receptionist", "doctor", "nurse"],
  pharmacy: ["hospital_admin", "pharmacist", "doctor"],
  billing: ["hospital_admin", "billing_clerk"],
  dashboard: [
    "hospital_admin",
    "department_head",
    "doctor",
    "nurse",
    "receptionist",
    "pharmacist",
    "billing_clerk",
  ],
};

export function canAccessModule(module: string, hmsRole: string | null | undefined): boolean {
  if (!hmsRole) return false;
  const roles = MODULE_ROLES[module];
  if (!roles) return false;
  return roles.includes(hmsRole);
}

export function isAdmin(hmsRole: string | null | undefined): boolean {
  return hmsRole === "hospital_admin";
}

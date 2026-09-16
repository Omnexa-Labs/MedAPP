import type { Identity } from "@/lib/session-types";
export const tokens = {
  access_token: "parent-access-secret",
  refresh_token: "parent-refresh-secret",
  expires_in: 900,
};
export const deviceId = "d".repeat(64);
export const user = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "ama@example.com",
  full_name: "Ama Mensah",
  role: "pharmacy_admin" as const,
};
export const identity: Identity = {
  scope: "a".repeat(32),
  user,
  mode: "medapp",
  pharmacy: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Care Pharmacy",
    deployment_key: "accra",
  },
};

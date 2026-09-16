import apiClient from "@/lib/api/client";
export const staffRoles = [
  "hospital_admin",
  "department_head",
  "doctor",
  "nurse",
  "pharmacist",
  "billing_clerk",
  "receptionist",
  "lab_tech",
] as const;
export const roleLabel = (role: string) => role.replaceAll("_", " ");
export interface Invitation {
  id: string;
  email: string;
  hms_role: string;
  status: "pending" | "accepted" | "cancelled" | "expired" | "unavailable";
  created_at: string;
  expires_at: string;
}
export interface Membership {
  id: string;
  user_id: string;
  hms_role: string;
  is_active: boolean;
  version: number;
  staff_id: string | null;
  name: string | null;
  email: string | null;
}
export interface InvitationInput {
  email: string;
  hms_role: string;
  employee_id?: string;
  title?: string;
  specialty?: string;
  qualification?: string;
  department_id?: string;
}
export const teamRepository = {
  history: (offset: number, signal?: AbortSignal) =>
    apiClient
      .get<{ items: AccessEvent[]; has_more: boolean }>("/v1/team/history", {
        params: { offset },
        signal,
      })
      .then((r) => r.data),
  invitations: (offset: number, signal?: AbortSignal) =>
    apiClient
      .get<{ items: Invitation[]; has_more: boolean }>("/v1/team/invitations", {
        params: { offset },
        signal,
      })
      .then((r) => r.data),
  memberships: (offset: number, signal?: AbortSignal) =>
    apiClient
      .get<{ items: Membership[]; has_more: boolean }>("/v1/team/memberships", {
        params: { offset },
        signal,
      })
      .then((r) => r.data),
  invite: (payload: InvitationInput, signal?: AbortSignal) =>
    apiClient
      .post<Invitation & { code: string }>("/v1/team/invitations", payload, {
        signal,
      })
      .then((r) => r.data),
  cancel: (id: string) => apiClient.delete(`/v1/team/invitations/${id}`),
  change: (row: Membership, hms_role: string, is_active: boolean) =>
    apiClient.patch(`/v1/team/memberships/${row.id}`, {
      version: row.version,
      hms_role,
      is_active,
    }),
};
export interface AccessEvent {
  id: string;
  created_at: string;
  actor_id: string;
  actor_name: string | null;
  action: string;
  recipient_email: string | null;
  details: {
    user_id?: string;
    hms_role?: string;
    before?: { hms_role: string; is_active: boolean };
    after?: { hms_role: string; is_active: boolean };
  };
}
export function teamError(error: unknown) {
  const failure = error as {
    response?: { data?: { detail?: unknown } };
    message?: string;
  };
  return typeof failure.response?.data?.detail === "string"
    ? failure.response.data.detail
    : failure.message || "The staff request could not be completed. Try again.";
}

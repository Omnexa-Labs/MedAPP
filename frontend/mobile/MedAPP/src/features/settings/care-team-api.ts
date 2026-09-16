import { client } from "@/lib/api/client";

export type ClinicianRole = "doctor" | "nurse";
export interface CareClinician {
  userId: string;
  profileId: string;
  name: string;
  specialty: string | null;
  role: ClinicianRole;
}
interface ClinicianWire {
  doctor_id?: string;
  nurse_id?: string;
  user_id: string;
  first_name: string;
  last_name: string;
  specialty: string | null;
  is_active: boolean;
  is_listable: boolean;
}
export interface CareConsent {
  consent_id: string;
  patient_id: string;
  doctor_user_id: string;
  scope: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  status: "active" | "revoked" | "expired";
  clinician_display_name: string | null;
  clinician_role: string | null;
}
export interface ConsentPage {
  items: CareConsent[];
  next_offset: number | null;
  offset: number;
  limit: number;
}
export type ConsentDuration = 7 | 30 | 90;

export function careTeamApi(isSessionCurrent: () => boolean) {
  const options = { isSessionCurrent };
  const path = (userId: string) => `/v1/patients/${encodeURIComponent(userId)}/consents`;
  return {
    async search(
      role: ClinicianRole,
      query: string,
      signal?: AbortSignal,
    ): Promise<CareClinician[]> {
      const params = new URLSearchParams({ q: query.trim(), only_listable: "true" });
      const page = await client.get<{ items: ClinicianWire[] }>(
        `/v1/${role === "doctor" ? "doctors" : "nurses"}?${params}`,
        { ...options, signal },
      );
      return page.items
        .filter((person) => person.is_active && person.is_listable && person.user_id)
        .map((person) => ({
          // The consent recipient is the identity user_id, not the directory profile id.
          userId: person.user_id,
          profileId: (role === "doctor" ? person.doctor_id : person.nurse_id) ?? "",
          name: [person.first_name, person.last_name].filter(Boolean).join(" ").trim(),
          specialty: person.specialty,
          role,
        }));
    },
    list(
      userId: string,
      offset = 0,
      includeInactive = false,
      clinicianId?: string,
    ): Promise<ConsentPage> {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: "25",
        include_inactive: String(includeInactive),
      });
      if (clinicianId) params.set("clinician_user_id", clinicianId);
      return client.get(`${path(userId)}?${params}`, options);
    },
    grant(
      userId: string,
      clinicianId: string,
      allowVitals: boolean,
      duration: ConsentDuration,
    ): Promise<CareConsent> {
      return client.post(
        path(userId),
        {
          doctor_user_id: clinicianId,
          scope: allowVitals ? "records_and_vitals" : "records",
          expires_in_days: duration,
          reason: "Patient confirmation in care-team sharing settings",
        },
        options,
      );
    },
    revoke(userId: string, consentId: string): Promise<CareConsent> {
      return client.delete(`${path(userId)}/${encodeURIComponent(consentId)}`, options);
    },
  };
}

export function permissionLabel(scope: string): string {
  if (scope === "records") return "View EHR summary and vitals";
  if (scope === "records_and_vitals") return "View EHR summary and add vitals";
  return "Legacy permission — access scope unavailable";
}

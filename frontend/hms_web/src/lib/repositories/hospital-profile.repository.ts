import apiClient from "@/lib/api/client";

export interface HospitalDetails {
  name: string;
  description: string | null;
  specialty: string | null;
  insurance_accepted: string[];
  address_line1: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
}
export interface HospitalProfile {
  hospital_id: string;
  version: number;
  draft: HospitalDetails;
  published: HospitalDetails | null;
  is_listed: boolean;
  has_unpublished_changes: boolean;
  last_published_at: string | null;
  publication_issues: { field: string; message: string }[];
  accreditation: string | null;
  accreditation_status: string;
}
export interface ProfileEvent {
  id: string;
  actor_id: string;
  version: number;
  action: string;
  created_at: string;
  changed_fields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}
const path = "/v1/hospital-profile";
export const hospitalProfileRepository = {
  get: (signal?: AbortSignal) =>
    apiClient.get<HospitalProfile>(path, { signal }).then((r) => r.data),
  save: (
    version: number,
    changes: Partial<HospitalDetails>,
    signal?: AbortSignal,
  ) =>
    apiClient
      .patch<HospitalProfile>(path, { version, changes }, { signal })
      .then((r) => r.data),
  publish: (version: number, signal?: AbortSignal) =>
    apiClient
      .post<HospitalProfile>(`${path}/publish`, { version }, { signal })
      .then((r) => r.data),
  withdraw: (version: number, signal?: AbortSignal) =>
    apiClient
      .post<HospitalProfile>(`${path}/withdraw`, { version }, { signal })
      .then((r) => r.data),
  history: (offset: number, signal?: AbortSignal) =>
    apiClient
      .get<{ items: ProfileEvent[]; has_more: boolean }>(`${path}/history`, {
        params: { offset },
        signal,
      })
      .then((r) => r.data),
};

export const fieldLabels: Record<string, string> = {
  name: "Hospital name",
  description: "About the hospital",
  specialty: "Specialty",
  insurance_accepted: "Accepted insurance",
  address_line1: "Street address",
  city: "City",
  country: "Country",
  latitude: "Latitude",
  longitude: "Longitude",
  website_url: "Website",
  contact_phone: "Contact phone",
  contact_email: "Contact email",
  is_listed: "Listed in patient directory",
};
export function profileError(error: unknown) {
  const failure = error as {
    response?: { status?: number; data?: { detail?: unknown } };
  };
  const detail = failure?.response?.data?.detail;
  const messages =
    typeof detail === "string"
      ? [detail]
      : Array.isArray(detail)
        ? detail.flatMap((item) =>
            typeof item?.msg === "string" ? [item.msg] : [],
          )
        : [];
  return {
    messages: messages.length
      ? messages
      : [
          "The profile request could not be completed. Reload the saved profile to check its latest state.",
        ],
    reloadRequired:
      !failure?.response?.status ||
      failure.response.status === 409 ||
      failure.response.status >= 500,
  };
}

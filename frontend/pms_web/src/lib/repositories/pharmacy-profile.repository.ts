import apiClient from "@/lib/api/client";

export interface PharmacyDetails {
  name: string;
  description: string | null;
  services_offered: string[];
  operating_hours: Record<string, string> | null;
  photo_url: string | null;
  head_pharmacist_name: string | null;
  head_pharmacist_bio: string | null;
  insurance_accepted: string[];
  address_line1: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
  phone: string | null;
  email: string | null;
}
export interface PharmacyProfile {
  pharmacy_id: string;
  version: number;
  draft: PharmacyDetails;
  published: PharmacyDetails | null;
  is_listed: boolean;
  has_unpublished_changes: boolean;
  last_published_at: string | null;
  publication_issues: { field: string; message: string }[];
  license_number: string | null;
  license_categories: string[];
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
const path = "/v1/pharmacy-profile";
export function managedPhotoId(url: string) {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  return new RegExp(`^/v1/pharmacies/${uuid}/photos/(${uuid})$`).exec(url)?.[1];
}
export const pharmacyProfileRepository = {
  uploadPhoto: (version: number, file: File, signal?: AbortSignal) =>
    apiClient
      .post<PharmacyProfile>(`${path}/photo`, file, {
        signal,
        headers: { "Content-Type": file.type, "If-Match": String(version) },
      })
      .then((r) => r.data),
  photo: (id: string, signal?: AbortSignal) =>
    apiClient
      .get<Blob>(`${path}/photos/${id}`, { signal, responseType: "blob" })
      .then((r) => r.data),
  get: (signal?: AbortSignal) =>
    apiClient.get<PharmacyProfile>(path, { signal }).then((r) => r.data),
  save: (
    version: number,
    changes: Partial<PharmacyDetails>,
    signal?: AbortSignal,
  ) =>
    apiClient
      .patch<PharmacyProfile>(path, { version, changes }, { signal })
      .then((r) => r.data),
  publish: (version: number, signal?: AbortSignal) =>
    apiClient
      .post<PharmacyProfile>(`${path}/publish`, { version }, { signal })
      .then((r) => r.data),
  withdraw: (version: number, signal?: AbortSignal) =>
    apiClient
      .post<PharmacyProfile>(`${path}/withdraw`, { version }, { signal })
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
  name: "Pharmacy name",
  description: "About the pharmacy",
  services_offered: "Services offered",
  operating_hours: "Weekly opening hours",
  photo_url: "Pharmacy photo",
  head_pharmacist_name: "Head pharmacist name",
  head_pharmacist_bio: "About the head pharmacist",
  insurance_accepted: "Accepted insurance",
  address_line1: "Street address",
  city: "City",
  country: "Country",
  latitude: "Latitude",
  longitude: "Longitude",
  website_url: "Website",
  phone: "Contact phone",
  email: "Contact email",
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

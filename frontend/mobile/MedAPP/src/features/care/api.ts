// Find-Care directory API.
//
// Backend routes (all via api_gateway on :8000):
//   GET /v1/doctors     ?q=&specialty=                       -> DoctorList
//   GET /v1/nurses      ?q=&specialty=&within_km=&lat=&lng=  -> NurseList
//   GET /v1/hospitals   ?q=&city=&specialty=&insurance=      -> HospitalList
//   GET /v1/pharmacies  ?q=&city=&insurance=&limit=&offset=  -> { items, total, ... }
//   GET /v1/pharmacists ?q=&pharmacy_id=&limit=&offset=      -> { items, total, ... }
//
// Wire shapes mirror server responses (snake_case). The exported
// `careApi` returns the same `DirectoryEntry` discriminated union the
// FindCareScreen already renders, so the screen's filter/render
// pipeline doesn't need to change shape — only the source.
//
// Adapter philosophy mirrors `src/features/auth/api.ts:adaptUser`:
// wire-only types live here, app-facing types are imported by the
// hook + screen. Photos default to a placeholder PNG bundled in
// assets when the backend returns null. Availability tone is a
// best-effort derivation from the data we have; it'll be exact once
// presence service lands.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// Expo-specific code here. None today.

import { client } from "@/lib/api/client";
import type {
  DirectoryEntry,
  FacilityEntry,
  PersonEntry,
} from "@/features/care/types";

// ---- Wire shapes ---------------------------------------------------------

interface DoctorWire {
  doctor_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  specialty: string | null;
  bio: string | null;
  languages: string[];
  consultation_fee_cents: number | null;
  photo_url: string | null;
  is_listable: boolean;
  is_active: boolean;
}

interface NurseWire {
  nurse_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  specialty: string | null;
  bio: string | null;
  languages: string[];
  home_visit_fee_cents: number | null;
  photo_url: string | null;
  is_listable: boolean;
  is_active: boolean;
}

interface HospitalWire {
  hospital_id: string;
  name: string;
  slug: string;
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

interface PharmacyWire {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  license_categories: string[];
  address_line1: string | null;
  city: string | null;
  country: string | null;
  insurance_accepted: string[];
  photo_url: string | null;
  operating_hours: Record<string, string> | null;
  is_listable: boolean;
  is_active: boolean;
}

interface PharmacistWire {
  pharmacist_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  license_number: string;
  bio: string | null;
  languages: string[];
  specialties: string[];
  photo_url: string | null;
  affiliated_pharmacy_id: string | null;
  is_listable: boolean;
  is_active: boolean;
}

interface DoctorListWire { items: DoctorWire[] }
interface NurseListWire { items: NurseWire[] }
interface HospitalListWire { items: HospitalWire[] }
interface PaginatedWire<T> { items: T[]; total: number; limit: number; offset: number }

// ---- Helpers -------------------------------------------------------------

// Placeholder avatar — used when the backend returns a null photo_url.
// Hosted on the same Stitch CDN the mocks already used so design
// review still sees a real face, not a broken-image icon.
const PLACEHOLDER_AVATAR =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuB18IjKJ9pWnzbeHRjM4ZUOVXSZTfnjY43r7HgHPIFgQlzNLz3dyVzSJokCmLO0RudVzbkPUquMRqvWXuaRItP8Jv94heS_2XT3ta5dMd-ae8ignM9lwNHppN5owfCxTdh1N6lYuGdb62O5VIEt2MNI6Dr9gyddG26sX6o9wCa66V0mcwuuD9wzmYT6QLhWvKWE0bQRyMr8wgHnozaiPn7PNhhK2MbJRzD4WwxAK-XfF9oq_4DyNsrLtHL61anzfhXDlVVthUsbvyDh";

function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Truthy non-empty string → keeps a badge; empty/null → skip it.
function pushBadge<T>(arr: T[], value: T | null | undefined): void {
  if (value !== null && value !== undefined) arr.push(value);
}

// ---- Adapters ------------------------------------------------------------

function adaptDoctor(d: DoctorWire): PersonEntry {
  const badges: PersonEntry["badges"] = [];
  // Until presence service lands, surface "Available now" only when we
  // can prove it; for now we omit it. Specialty is the most useful
  // single-line context to a patient.
  pushBadge(badges, d.specialty ? { label: titleCase(d.specialty), tone: "secondary" } : null);
  if (d.languages.length > 0) {
    pushBadge(badges, { label: d.languages.slice(0, 2).join(", "), tone: "tertiary" });
  }
  return {
    kind: "person",
    category: "doctors",
    id: d.doctor_id,
    name: `Dr. ${d.first_name} ${d.last_name}`.trim(),
    title: d.specialty ? `${titleCase(d.specialty)} Specialist` : "Doctor",
    avatarUri: d.photo_url ?? PLACEHOLDER_AVATAR,
    // Without a presence signal, "online" is the safe neutral default;
    // the dot color still varies by data when we wire telepresence.
    availability: "online",
    badges,
  };
}

function adaptNurse(n: NurseWire): PersonEntry {
  const badges: PersonEntry["badges"] = [];
  pushBadge(badges, n.specialty ? { label: titleCase(n.specialty), tone: "secondary" } : null);
  // Home Service flag is implicit: any nurse with a home_visit_fee_cents
  // set is offering home visits. This is the cue the "Home Service"
  // facet looks for in screen-level filtering.
  if (n.home_visit_fee_cents !== null && n.home_visit_fee_cents !== undefined) {
    pushBadge(badges, { label: "Home Service", tone: "tertiary" });
  }
  return {
    kind: "person",
    category: "nurses",
    id: n.nurse_id,
    name: `${n.first_name} ${n.last_name}`.trim(),
    title: n.specialty ? `${titleCase(n.specialty)} Nurse` : "Nurse",
    avatarUri: n.photo_url ?? PLACEHOLDER_AVATAR,
    availability: "online",
    badges,
  };
}

function adaptHospital(h: HospitalWire): FacilityEntry {
  const badges: FacilityEntry["badges"] = [];
  // Whether a hospital runs 24/7 isn't in our model yet; safe default
  // is to say nothing rather than guess. Specialty + city are the most
  // useful second-line cues today.
  pushBadge(badges, h.specialty ? { label: titleCase(h.specialty), tone: "tertiary" } : null);
  return {
    kind: "facility",
    category: "hospitals",
    id: h.hospital_id,
    name: h.name,
    subtitle: h.city ?? h.address_line1 ?? "",
    icon: "local-hospital",
    iconTint: "tertiary",
    badges,
    // "View hospital", NOT "View Staff" (changed 2026-08-05).
    //
    // The staff roster this label promised CANNOT BE DELIVERED, and that is a
    // backend fact, not a design gap. `hospital_service/app/routers/hospitals.py`
    // exposes only `POST /v1/hospitals/{id}/staff` — there is no GET — and
    // `HospitalStaffOut` carries `user_id`, `role`, `title`, `department` and no
    // name or photo, with no user lookup anywhere in that service. So even with a
    // GET route the response could not name a single person.
    //
    // The designed screen (`hospital_detail`, Figma 1020:641) renders its Care
    // team section as an EmptyState reading "Staff directory not published" for
    // exactly this reason — drawn rather than omitted, because a button that
    // lands there has to be answered. This label is the other half of that: a
    // label whose data does not exist is a promise the next screen has to break.
    //
    // Restore "View Staff" when hospital_service ships BOTH a
    // `GET /v1/hospitals/{id}/staff` route AND name resolution for
    // `HospitalStaff.user_id`. Not one or the other.
    cta: { label: "View hospital", color: "tertiary" },
  };
}

function adaptPharmacy(p: PharmacyWire): FacilityEntry {
  const badges: FacilityEntry["badges"] = [];
  // operating_hours is a {day: "08:00-22:00"} map. We don't compute
  // "open now" here — too easy to get wrong without the user's TZ.
  // Surface the first hours string as a hint instead.
  const hoursValues = p.operating_hours ? Object.values(p.operating_hours) : [];
  if (hoursValues.length > 0) {
    pushBadge(badges, { label: `Open ${hoursValues[0]}`, tone: "open" });
  }
  if (p.insurance_accepted.length > 0) {
    pushBadge(badges, {
      label: `Accepts ${p.insurance_accepted.slice(0, 2).join(", ")}`,
      tone: "tertiary",
    });
  }
  return {
    kind: "facility",
    category: "pharmacies",
    id: p.id,
    name: p.name,
    subtitle: p.city ?? p.address_line1 ?? "",
    icon: "local-pharmacy",
    iconTint: "secondary",
    badges,
    cta: { label: "View Store", color: "info" },
  };
}

function adaptPharmacist(p: PharmacistWire): PersonEntry {
  const badges: PersonEntry["badges"] = [];
  if (p.specialties.length > 0) {
    pushBadge(badges, { label: titleCase(p.specialties[0]), tone: "secondary" });
  }
  if (p.languages.length > 0) {
    pushBadge(badges, { label: p.languages.slice(0, 2).join(", "), tone: "tertiary" });
  }
  return {
    kind: "person",
    category: "pharmacists",
    id: p.pharmacist_id,
    name: `${p.first_name} ${p.last_name}`.trim(),
    title: p.specialties.length > 0
      ? `${titleCase(p.specialties[0])} Pharmacist`
      : "Pharmacist",
    avatarUri: p.photo_url ?? PLACEHOLDER_AVATAR,
    availability: "online",
    badges,
  };
}

// ---- Query-string helpers ------------------------------------------------

function toQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// ---- API surface ---------------------------------------------------------

export interface ListParams {
  q?: string;
  specialty?: string;
  city?: string;
  pharmacyId?: string;
  limit?: number;
  offset?: number;
}

export const careApi = {
  async listDoctors(p: ListParams = {}): Promise<DirectoryEntry[]> {
    const qs = toQuery({ q: p.q, specialty: p.specialty });
    const wire = await client.get<DoctorListWire>(`/v1/doctors${qs}`);
    return wire.items.map(adaptDoctor);
  },

  async listNurses(p: ListParams = {}): Promise<DirectoryEntry[]> {
    const qs = toQuery({ q: p.q, specialty: p.specialty });
    const wire = await client.get<NurseListWire>(`/v1/nurses${qs}`);
    return wire.items.map(adaptNurse);
  },

  async listHospitals(p: ListParams = {}): Promise<DirectoryEntry[]> {
    const qs = toQuery({ q: p.q, city: p.city });
    const wire = await client.get<HospitalListWire>(`/v1/hospitals${qs}`);
    return wire.items.map(adaptHospital);
  },

  async listPharmacies(p: ListParams = {}): Promise<DirectoryEntry[]> {
    const qs = toQuery({ q: p.q, city: p.city, limit: p.limit, offset: p.offset });
    const wire = await client.get<PaginatedWire<PharmacyWire>>(`/v1/pharmacies${qs}`);
    return wire.items.map(adaptPharmacy);
  },

  async listPharmacists(p: ListParams = {}): Promise<DirectoryEntry[]> {
    const qs = toQuery({
      q: p.q,
      pharmacy_id: p.pharmacyId,
      limit: p.limit,
      offset: p.offset,
    });
    const wire = await client.get<PaginatedWire<PharmacistWire>>(`/v1/pharmacists${qs}`);
    return wire.items.map(adaptPharmacist);
  },

  /**
   * One doctor by id — `GET /v1/doctors/{doctor_id}` -> `DoctorProfileOut`.
   *
   * The list endpoints above return only `is_listable` doctors, so they are the
   * wrong way to resolve a doctor you already hold an id for: a clinician can
   * be unlisted (retired, on leave, private) and still be the one a patient has
   * an existing booking with. Anything hydrating a stored `doctor_id` — the
   * appointments list, a booking receipt — must come through here.
   */
  async getDoctor(doctorId: string): Promise<DoctorSummary> {
    const d = await client.get<DoctorWire>(`/v1/doctors/${doctorId}`);
    return {
      doctorId: d.doctor_id,
      // The wire has no title; "Dr." is the app's own presentation, applied in
      // exactly one place so it cannot drift between screens.
      name: `Dr. ${d.first_name} ${d.last_name}`.trim(),
      specialty: d.specialty ? titleCase(d.specialty) : null,
      avatarUri: d.photo_url ?? PLACEHOLDER_AVATAR,
    };
  },
};

/**
 * The subset of a doctor other features need to render a reference to one.
 * Deliberately not `PersonEntry`: that type carries directory-only concerns
 * (badges, distance, availability tone) which mean nothing on an appointment
 * card and would invite a screen to render a stale "Available now".
 */
export interface DoctorSummary {
  doctorId: string;
  name: string;
  specialty: string | null;
  avatarUri: string;
}

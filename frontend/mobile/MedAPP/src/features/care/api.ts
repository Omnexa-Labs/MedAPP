// Find-Care directory API.
//
// Backend routes (all via api_gateway on :8000):
//   GET /v1/doctors     ?q=&specialty=                       -> DoctorList
//   GET /v1/nurses      ?q=&specialty=&within_km=&lat=&lng=  -> NurseList
//   GET /v1/hospitals   ?q=&city=&specialty=&insurance=      -> HospitalList
//   GET /v1/pharmacies  ?q=&city=&insurance=&limit=&offset=  -> { items, total, ... }
//   GET /v1/pharmacists ?q=&pharmacy_id=&limit=&offset=      -> { items, total, ... }
//
// Single-resource GETs, for the detail screens (see the DETAIL SECTION below):
//   GET /v1/hospitals/{id}                     -> HospitalOut
//   GET /v1/hospitals/{id}/reviews             -> HospitalReviewOut[]  (bare array)
//   GET /v1/hospitals/{id}/staff               -> HospitalStaffRoster
//   GET /v1/pharmacies/{id}                    -> PharmacyOut
//   GET /v1/pharmacies/{id}/stock?drug_name=   -> PharmacyStockBadgeOut
//
// Wire shapes mirror server responses (snake_case). The exported
// `careApi` returns the same `DirectoryEntry` discriminated union the
// FindCareScreen already renders, so the screen's filter/render
// pipeline doesn't need to change shape — only the source.
//
// Adapter philosophy mirrors `src/features/auth/api.ts:adaptUser`:
// wire-only types live here, app-facing types are imported by the
// hook + screen.
//
// TWO THINGS THIS FILE USED TO INVENT AND NO LONGER DOES, both because the
// backend has no field behind them and both detailed at their sites below:
// a stock photograph substituted for an absent `photo_url`, and a hardcoded
// `availability: "online"` on every person in the directory.
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

// ---- Wire shapes, detail-only ---------------------------------------------
//
// These are the fields the LIST wire above throws away. They exist on the same
// rows; the list adapters simply never read them, because a directory card has
// no room for a description or a licence number. Kept as separate interfaces
// rather than making the list fields optional, so a list adapter cannot
// accidentally start depending on a field the list query does not select for.

interface HospitalDetailWire extends HospitalWire {
  accreditation: string | null;
  // NOT NULL on the column, DB default "pending" — so it is always a string,
  // and "pending" is NOT the same claim as "accredited". See adaptHospitalDetail.
  accreditation_status: string;
  is_active: boolean;
}

interface HospitalReviewWire {
  review_id: string;
  hospital_id: string;
  // A raw user UUID. hospital_service has no name resolution, so a review can
  // never be attributed to a person — see the adapter.
  reviewer_user_id: string;
  rating: number;
  title: string;
  body: string | null;
  is_public: boolean;
  moderation_status: string;
  created_at: string;
  updated_at: string;
}

interface HospitalStaffEntryWire {
  staff_id: string;
  hospital_id: string;
  role: string;
  title: string | null;
  department: string | null;
  // Withheld (null) for anyone who is not a hospital_admin / platform_admin.
  // We never render it — a UUID is not an identity to a patient.
  user_id: string | null;
}

interface HospitalStaffRosterWire {
  items: HospitalStaffEntryWire[];
  names_available: boolean;
  names_unavailable_reason: string | null;
  includes_user_ids: boolean;
}

interface PharmacyDetailWire {
  pharmacy_id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  license_number: string | null;
  license_categories: string[];
  address_line1: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  // NOTE THE COLUMN NAMES. Pharmacies have `phone`/`email`; hospitals have
  // `contact_phone`/`contact_email`. They are different tables in different
  // services and neither carries the other's spelling.
  phone: string | null;
  email: string | null;
  website_url: string | null;
  insurance_accepted: string[];
  operating_hours: Record<string, string> | null;
  photo_url: string | null;
  is_listable: boolean;
  is_active: boolean;
  // `pms_base_url` and `pms_partner_secret_id` are also on this response.
  // Deliberately NOT typed here: they are operational plumbing, and a field
  // that has no type has no way of reaching a screen.
}

interface PharmacyStockWire {
  pharmacy_id: string;
  drug_name: string;
  available: boolean;
  quantity: number | null;
  price_cents: number | null;
  currency: string | null;
  // "pms" = we asked the pharmacy's system and this is its answer.
  // "unknown" = we could not reach it. The two must not render the same.
  source: string;
}

interface DoctorListWire { items: DoctorWire[] }
interface NurseListWire { items: NurseWire[] }
interface HospitalListWire { items: HospitalWire[] }
interface PaginatedWire<T> { items: T[]; total: number; limit: number; offset: number }

// ---- Helpers -------------------------------------------------------------

// ===========================================================================
// `PLACEHOLDER_AVATAR` IS DELETED. It was a photograph of a real person.
// ===========================================================================
// A single Stitch-CDN portrait, substituted for `photo_url` on every doctor,
// nurse and pharmacist whose record has no photo — which, on the seeded roster,
// is most of them. Its own comment said the quiet part: "so design review still
// sees a real face". Design review is not the audience; a patient choosing a
// clinician is, and they were shown a stranger's face over a named clinician's
// record, repeated identically down the list. That is worse than a missing
// photo in both directions — it misrepresents the clinician, and it uses
// somebody's likeness who never agreed to appear in a medical product.
//
// It is not replaced with another image. `avatarUri` is `""` when there is no
// photo, and `AvatarWithFallback` — the chain docs/BRAND.md §App shell already
// mandates, photo -> initials -> silhouette — draws the clinician's own
// initials. The codebase had the right answer at the call sites and was feeding
// it a wrong one from here.

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
  // Specialty is the most useful single-line context to a patient. There is no
  // "Available now" badge and no presence field — see the deleted
  // `AvailabilityTone` in ./types.ts.
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
    avatarUri: d.photo_url ?? "",
    // CARRIED, not dropped. `consultation_fee_cents` has been on this wire the
    // whole time and this adapter silently discarded it, so the funnel had no
    // price to show and a patient confirmed a medical appointment without ever
    // seeing what it costs. It travels to the review screen, which is where the
    // commit happens. MINOR UNITS — nothing on this path may render it raw.
    consultationFeeCents: d.consultation_fee_cents,
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
    avatarUri: n.photo_url ?? "",
    // `home_visit_fee_cents` is NOT mapped to `consultationFeeCents`. It is a
    // different fee for a different service, and nurses are not bookable through
    // this app at all (`BookingCreate.doctor_id`), so there is no commit screen
    // for it to inform.
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
    // "View hospital", NOT "View Staff" (changed 2026-08-05, re-confirmed
    // 2026-08-06 when the GET route landed and did NOT change the answer).
    //
    // The original reasoning was that `hospital_service` exposed only
    // `POST /v1/hospitals/{id}/staff` with no GET at all. Half of that is now
    // out of date: `GET /v1/hospitals/{id}/staff` shipped 2026-08-06 and
    // `hospital-detail` renders the real roster. The OTHER half is unchanged and
    // is the half this label turns on — the response carries `role`, `title`,
    // `department` and **no name and no photo**, and says so in the payload
    // (`names_available: false`), because `user_service` has no batch name
    // lookup. A CTA reading "View Staff" still promises a list of people the
    // next screen cannot name.
    //
    // Restore "View Staff" when the roster gains name resolution for
    // `HospitalStaff.user_id` — i.e. when `names_available` can come back true.
    // The route existing was never sufficient on its own.
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
    avatarUri: p.photo_url ?? "",
    badges,
  };
}

// ---- Detail adapters -----------------------------------------------------
//
// ===========================================================================
// THESE READ THE SINGLE-RESOURCE GETs. NEVER THE LIST ENDPOINTS.
// ===========================================================================
// The list adapters above are lossy BY DESIGN — `adaptHospital` keeps four of
// fourteen columns, `adaptPharmacy` keeps five of twenty — because a directory
// card renders a name, a place and a CTA. Resolving an id you already hold by
// scanning a list is wrong twice over:
//
//   1. It loses the record. `description`, `license_number`, the seven-day
//      `operating_hours` map, `accreditation` — none of them survive the trip
//      through `FacilityEntry`, which has no field to put them in.
//   2. The list is FILTERED. `GET /v1/pharmacies` defaults `only_listable=true`
//      and `is_listable` defaults to FALSE on the column, so a pharmacy that
//      exists, is active, and is the one the user tapped can be absent from
//      every page of the list. `GET /v1/hospitals` filters `is_active`; the
//      detail route does not.
//
// `getDoctor`'s docstring below records this same mistake being made once
// already, for appointments. This is the facility half of it.

function adaptHospitalDetail(h: HospitalDetailWire): HospitalDetail {
  return {
    hospitalId: h.hospital_id,
    name: h.name,
    description: h.description,
    // `specialty` is the hospital's own free-text kind ("general", "maternity").
    // It is the only thing behind the frame's "General Hospital" line.
    specialty: h.specialty ? titleCase(h.specialty) : null,
    insuranceAccepted: h.insurance_accepted,
    addressLine1: h.address_line1,
    city: h.city,
    country: h.country,
    websiteUrl: h.website_url,
    contactPhone: h.contact_phone,
    contactEmail: h.contact_email,
    accreditation: h.accreditation,
    // Passed through raw and lower-cased rather than mapped to a boolean. The
    // column has no enum and no CHECK constraint, so any string is possible;
    // collapsing it to `isAccredited` would have to guess what an unknown value
    // means, and the safe guess ("not accredited") is a claim about a real
    // hospital. The screen decides how to word each value it recognises.
    accreditationStatus: h.accreditation_status.toLowerCase(),
  };
}

function adaptHospitalReview(r: HospitalReviewWire): HospitalReview {
  return {
    reviewId: r.review_id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    createdAt: r.created_at,
    // `reviewer_user_id` is deliberately NOT carried across. It is a UUID, the
    // service has no name lookup, and a field that reaches a screen is a field
    // a screen eventually renders.
  };
}

function adaptHospitalStaff(w: HospitalStaffRosterWire): HospitalStaffRoster {
  return {
    items: w.items.map((s) => ({
      staffId: s.staff_id,
      role: s.role,
      title: s.title,
      department: s.department,
    })),
    namesAvailable: w.names_available,
    namesUnavailableReason: w.names_unavailable_reason,
  };
}

function adaptPharmacyDetail(p: PharmacyDetailWire): PharmacyDetail {
  return {
    pharmacyId: p.pharmacy_id,
    name: p.name,
    description: p.description,
    licenseNumber: p.license_number,
    licenseCategories: p.license_categories,
    addressLine1: p.address_line1,
    city: p.city,
    country: p.country,
    phone: p.phone,
    email: p.email,
    websiteUrl: p.website_url,
    insuranceAccepted: p.insurance_accepted,
    // Passed through verbatim, keys and values. The column is plain JSON with
    // no server-side validation, so normalising it here would be inventing a
    // guarantee; `HoursRow`'s caller parses defensively instead.
    operatingHours: p.operating_hours,
    photoUrl: p.photo_url,
  };
}

function adaptStock(s: PharmacyStockWire): StockCheck {
  return {
    drugName: s.drug_name,
    available: s.available,
    quantity: s.quantity,
    priceCents: s.price_cents,
    currency: s.currency,
    // The endpoint answers 200 even when it could not reach the pharmacy's
    // system, and distinguishes the two ONLY here. `source: "unknown"` with a
    // null quantity means "we do not know", which is not "out of stock".
    source: s.source === "pms" ? "pms" : "unknown",
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
      // `""` when the record has no photo. Consumers pass this to
      // `AvatarWithFallback`, which draws initials — see the deleted
      // PLACEHOLDER_AVATAR note.
      avatarUri: d.photo_url ?? "",
      consultationFeeCents: d.consultation_fee_cents,
    };
  },

  /**
   * One hospital by id — `GET /v1/hospitals/{hospital_id}` -> `HospitalOut`.
   *
   * The full record, which is what `hospital-detail` renders. NOT
   * `listHospitals`: that adapter keeps four columns and the route filters
   * `is_active`, which the detail route does not. A 404 throws `ApiError`
   * with `status: 404` and the screen renders its not-found panel.
   */
  async getHospital(hospitalId: string): Promise<HospitalDetail> {
    const h = await client.get<HospitalDetailWire>(`/v1/hospitals/${hospitalId}`);
    return adaptHospitalDetail(h);
  },

  /**
   * `GET /v1/hospitals/{hospital_id}/reviews` -> a BARE ARRAY, not an envelope.
   *
   * No `items`, no `total`, no pagination, no query params — the route returns
   * every public review, newest first. An unknown hospital id returns `200 []`
   * rather than 404 (the asymmetry with `/staff` is called out in the service's
   * own docstring), so an empty list here proves nothing about the hospital.
   */
  async listHospitalReviews(hospitalId: string): Promise<HospitalReview[]> {
    const wire = await client.get<HospitalReviewWire[]>(
      `/v1/hospitals/${hospitalId}/reviews`,
    );
    return wire.map(adaptHospitalReview);
  },

  /**
   * `GET /v1/hospitals/{hospital_id}/staff` -> `HospitalStaffRoster`.
   *
   * ADDED 2026-08-06, and it supersedes the "there is no GET" note that
   * `adaptHospital`'s CTA comment was built on. What it does NOT supersede is
   * the reason that CTA stopped saying "View Staff": the roster carries
   * `role`, `title` and `department` and **no name and no photo**, because
   * `user_service` has no batch name lookup. `names_available` is the server
   * saying so in the payload rather than leaving the client to infer it from
   * absent keys.
   *
   * Unlike every other route here this one REQUIRES a bearer token at the
   * service (not merely at the gateway), and 404s on an unknown hospital.
   */
  async listHospitalStaff(hospitalId: string): Promise<HospitalStaffRoster> {
    const wire = await client.get<HospitalStaffRosterWire>(
      `/v1/hospitals/${hospitalId}/staff`,
    );
    return adaptHospitalStaff(wire);
  },

  /**
   * One pharmacy by id — `GET /v1/pharmacies/{pharmacy_id}` -> `PharmacyOut`.
   *
   * THE TRAP THIS METHOD EXISTS TO AVOID: `listPharmacies` defaults
   * `only_listable=true` while the `is_listable` COLUMN defaults to false, so
   * the list can legitimately omit the pharmacy the user just tapped. It also
   * drops `description`, `license_number`, `operating_hours`, `phone`,
   * `email`, `website_url` and `photo_url` on the floor. This is the record.
   *
   * A pharmacy with `is_active = false` 404s here — the service treats
   * deactivated and missing as one state.
   */
  async getPharmacy(pharmacyId: string): Promise<PharmacyDetail> {
    const p = await client.get<PharmacyDetailWire>(`/v1/pharmacies/${pharmacyId}`);
    return adaptPharmacyDetail(p);
  },

  /**
   * `GET /v1/pharmacies/{pharmacy_id}/stock?drug_name=` -> live stock.
   *
   * One drug per call; `drug_name` is required and must be non-empty. The
   * pharmacy's own dispensing system answers, so the result is a moment in
   * time, not a reservation — the screen says so.
   *
   * 404 means the pharmacy publishes no stock at all ("not wired to a pharmacy
   * management system"), which is a DIFFERENT statement from "not stocked" —
   * the latter comes back 200 with `available: false`.
   */
  async checkStock(pharmacyId: string, drugName: string): Promise<StockCheck> {
    const qs = toQuery({ drug_name: drugName });
    const s = await client.get<PharmacyStockWire>(
      `/v1/pharmacies/${pharmacyId}/stock${qs}`,
    );
    return adaptStock(s);
  },
};

/**
 * The subset of a doctor other features need to render a reference to one.
 * Deliberately not `PersonEntry`: that type carries directory-only concerns
 * (badges, distance) which mean nothing on an appointment card.
 */
export interface DoctorSummary {
  doctorId: string;
  name: string;
  specialty: string | null;
  /** `""` when the record has no photo — never a substitute image. */
  avatarUri: string;
  /** MINOR UNITS, or null when no fee is recorded. See `PersonEntry`. */
  consultationFeeCents?: number | null;
}

/**
 * One hospital, whole. Every field here has a column in
 * `hospital_service`'s `hospital_profiles` table — checked one by one against
 * the model and all three migrations before it was added.
 *
 * WHAT IS NOT HERE, AND WHY IT MUST NOT BE ADDED WITHOUT A MIGRATION:
 * opening hours, bed count, department list, wait time, aggregate rating,
 * review count, photo, distance in km, "24/7 emergency", "open now". None of
 * them exist on the table. `docs/PIPELINE.md` §5 (2026-08-05) refused each one
 * by name at design time; adding one to this interface is how it comes back.
 * `latitude`/`longitude` DO exist but are omitted: nothing on the screen
 * consumes them, and the Directions handoff uses the postal address, which is
 * what a maps app resolves better anyway.
 */
export interface HospitalDetail {
  hospitalId: string;
  name: string;
  description: string | null;
  specialty: string | null;
  insuranceAccepted: string[];
  addressLine1: string | null;
  city: string | null;
  country: string | null;
  websiteUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  accreditation: string | null;
  /** Lower-cased, free text. "pending" is the DB default and the common value. */
  accreditationStatus: string;
}

/**
 * One patient review. Unattributed by construction: the row holds a
 * `reviewer_user_id` and nothing else about the person, so the card shows a
 * rating, a date and words. There is no "Verified patient" badge to be had.
 */
export interface HospitalReview {
  reviewId: string;
  rating: number;
  title: string;
  body: string | null;
  /** ISO-8601 from the server. */
  createdAt: string;
}

/** One row of a hospital's care team. There is no name field. There is no photo. */
export interface HospitalStaffMember {
  staffId: string;
  /** Free String(32); the service's own enum is doctor|nurse|admin|other but is not enforced. */
  role: string;
  title: string | null;
  department: string | null;
}

export interface HospitalStaffRoster {
  items: HospitalStaffMember[];
  /**
   * The server's own statement about its payload. Hardcoded `false` today —
   * `user_service` has no batch name lookup — so a screen that renders this
   * roster has to answer "why are these people anonymous?" rather than leave
   * a reader to conclude the hospital is hiding something.
   */
  namesAvailable: boolean;
  /** Present whenever `namesAvailable` is false. Service-speak; see the screen. */
  namesUnavailableReason: string | null;
}

/**
 * One pharmacy, whole.
 *
 * NOT HERE, and refused in `docs/PIPELINE.md` §5: "open now" (timezone-unsafe
 * without the user's zone — the seven-day table with a Today row says the same
 * thing honestly), delivery, distance, ratings, reviews. Also omitted:
 * `pms_base_url` / `pms_partner_secret_id`, which the public response leaks
 * and no screen has any business showing.
 */
export interface PharmacyDetail {
  pharmacyId: string;
  name: string;
  description: string | null;
  licenseNumber: string | null;
  licenseCategories: string[];
  addressLine1: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  insuranceAccepted: string[];
  /** `{"monday": "08:00-22:00", ..., "sunday": "closed"}` by convention only. */
  operatingHours: Record<string, string> | null;
  photoUrl: string | null;
}

/** The answer to one "do you have X?" question, at one moment. */
export interface StockCheck {
  drugName: string;
  available: boolean;
  quantity: number | null;
  /** Minor units. `currency` names them; neither is guaranteed present. */
  priceCents: number | null;
  currency: string | null;
  /** "pms" = the pharmacy answered. "unknown" = we could not reach it. */
  source: "pms" | "unknown";
}

// careApi's facility half — the five single-resource calls behind
// `hospital-detail` and `pharmacy-detail`.
//
// This suite exists because of ONE class of defect that a screen test cannot
// see: the screens mock the hooks, the hooks mock nothing, and so the path
// strings and the snake_case -> camelCase mapping are asserted nowhere else. A
// screen suite passes just as happily against `/v1/hospital/{id}` as against
// `/v1/hospitals/{id}` — that is the shape of the `/v1/appointments` incident.
//
// What is pinned:
//   1. the exact path and query string of each call,
//   2. that the DETAIL calls are used, not the list ones (`?only_listable`
//      never appears; no `/v1/pharmacies?` with a query),
//   3. that fields with no column are not conjured by an adapter,
//   4. that `source: "unknown"` survives as itself.
//
// SEAM: `@/lib/api/client`, the module boundary below the adapters.

const mockGet = jest.fn();
jest.mock("@/lib/api/client", () => ({
  client: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  registerAuthTokenProvider: jest.fn(),
  registerDeviceIdProvider: jest.fn(),
}));

import { careApi } from "../api";

const HOSPITAL_WIRE = {
  hospital_id: "hosp-1",
  name: "Ridge Hospital",
  slug: "ridge-hospital",
  description: "A general hospital in Osu.",
  specialty: "general",
  insurance_accepted: ["NHIS"],
  address_line1: "12 Ridge Road, Osu",
  city: "Accra",
  country: "Ghana",
  latitude: 5.55,
  longitude: -0.18,
  website_url: "ridgehospital.gh",
  contact_phone: "+233 30 222 8382",
  contact_email: "records@ridgehospital.gh",
  accreditation: "HeFRA",
  accreditation_status: "Accredited",
  is_active: true,
};

const PHARMACY_WIRE = {
  pharmacy_id: "pharm-1",
  user_id: "u-1",
  name: "Cedar Pharmacy",
  slug: "cedar-pharmacy",
  description: null,
  license_number: "PCG-2019-04471",
  license_categories: ["retail dispensing"],
  address_line1: "24 Oxford Street, Osu",
  city: "Accra",
  country: "Ghana",
  latitude: null,
  longitude: null,
  phone: "+233 30 278 1140",
  email: "hello@cedarpharmacy.gh",
  website_url: null,
  insurance_accepted: ["NHIS"],
  operating_hours: { monday: "08:00-22:00", sunday: "closed" },
  photo_url: null,
  is_listable: true,
  is_active: true,
  // Present on the real response and deliberately untyped by the client.
  pms_base_url: "https://pms.internal",
  pms_partner_secret_id: "secret-name",
};

beforeEach(() => jest.clearAllMocks());

describe("getHospital", () => {
  it("calls the single-resource route, not the list", async () => {
    mockGet.mockResolvedValue(HOSPITAL_WIRE);
    await careApi.getHospital("hosp-1");
    expect(mockGet).toHaveBeenCalledWith("/v1/hospitals/hosp-1");
    // The list route filters is_active and drops ten of fourteen columns.
    expect(mockGet).not.toHaveBeenCalledWith(expect.stringMatching(/^\/v1\/hospitals(\?|$)/));
  });

  it("carries the columns the list adapter throws away", async () => {
    mockGet.mockResolvedValue(HOSPITAL_WIRE);
    const h = await careApi.getHospital("hosp-1");
    expect(h.description).toBe("A general hospital in Osu.");
    expect(h.accreditation).toBe("HeFRA");
    expect(h.contactPhone).toBe("+233 30 222 8382");
    expect(h.contactEmail).toBe("records@ridgehospital.gh");
    expect(h.websiteUrl).toBe("ridgehospital.gh");
    // Lower-cased so the screen's status comparison is one branch, not five.
    expect(h.accreditationStatus).toBe("accredited");
  });

  it("invents no field the table has no column for", async () => {
    mockGet.mockResolvedValue(HOSPITAL_WIRE);
    const h = (await careApi.getHospital("hosp-1")) as unknown as Record<string, unknown>;
    for (const absent of [
      "operatingHours",
      "rating",
      "reviewCount",
      "bedCount",
      "photoUrl",
      "distanceKm",
      "openNow",
      "departments",
    ]) {
      expect(h[absent]).toBeUndefined();
    }
  });
});

describe("listHospitalReviews", () => {
  it("reads a bare array, not an envelope", async () => {
    mockGet.mockResolvedValue([
      {
        review_id: "r1",
        hospital_id: "hosp-1",
        reviewer_user_id: "u-9",
        rating: 4,
        title: "Clear triage",
        body: null,
        is_public: true,
        moderation_status: "approved",
        created_at: "2026-07-20T10:00:00Z",
        updated_at: "2026-07-20T10:00:00Z",
      },
    ]);
    const reviews = await careApi.listHospitalReviews("hosp-1");
    expect(mockGet).toHaveBeenCalledWith("/v1/hospitals/hosp-1/reviews");
    expect(reviews).toHaveLength(1);
    expect(reviews[0].title).toBe("Clear triage");
  });

  it("drops the reviewer id so no screen can render it", async () => {
    mockGet.mockResolvedValue([
      {
        review_id: "r1",
        hospital_id: "hosp-1",
        reviewer_user_id: "u-9",
        rating: 4,
        title: "Clear triage",
        body: null,
        is_public: true,
        moderation_status: "approved",
        created_at: "2026-07-20T10:00:00Z",
        updated_at: "2026-07-20T10:00:00Z",
      },
    ]);
    const [r] = await careApi.listHospitalReviews("hosp-1");
    // A UUID is not an identity, and a field that reaches a screen is a field
    // a screen eventually renders.
    expect((r as unknown as Record<string, unknown>).reviewerUserId).toBeUndefined();
  });
});

describe("listHospitalStaff", () => {
  it("keeps the server's own statement that names are missing", async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          staff_id: "s1",
          hospital_id: "hosp-1",
          role: "doctor",
          title: "Consultant Cardiologist",
          department: "Cardiology",
          user_id: null,
        },
      ],
      names_available: false,
      names_unavailable_reason: "display names are not published by this endpoint",
      includes_user_ids: false,
    });
    const roster = await careApi.listHospitalStaff("hosp-1");
    expect(mockGet).toHaveBeenCalledWith("/v1/hospitals/hosp-1/staff");
    expect(roster.namesAvailable).toBe(false);
    expect(roster.namesUnavailableReason).toMatch(/display names are not published/);
    expect(roster.items[0]).toEqual({
      staffId: "s1",
      role: "doctor",
      title: "Consultant Cardiologist",
      department: "Cardiology",
    });
    // No name, no photo, and no user_id either — the last is withheld from
    // non-admins anyway, and rendering a UUID is not an option worth having.
    expect((roster.items[0] as unknown as Record<string, unknown>).userId).toBeUndefined();
    expect((roster.items[0] as unknown as Record<string, unknown>).name).toBeUndefined();
  });
});

describe("getPharmacy", () => {
  it("calls the detail route, which is not filtered by only_listable", async () => {
    mockGet.mockResolvedValue(PHARMACY_WIRE);
    await careApi.getPharmacy("pharm-1");
    expect(mockGet).toHaveBeenCalledWith("/v1/pharmacies/pharm-1");
    // `GET /v1/pharmacies` defaults only_listable=true while the COLUMN
    // defaults false — the list can omit the pharmacy the user just tapped.
    expect(mockGet).not.toHaveBeenCalledWith(expect.stringContaining("only_listable"));
  });

  it("keeps the whole record, including the seven-day map", async () => {
    mockGet.mockResolvedValue(PHARMACY_WIRE);
    const p = await careApi.getPharmacy("pharm-1");
    expect(p.licenseNumber).toBe("PCG-2019-04471");
    expect(p.phone).toBe("+233 30 278 1140");
    expect(p.email).toBe("hello@cedarpharmacy.gh");
    // Verbatim: the column is plain JSON and normalising here would invent a
    // guarantee the server does not make.
    expect(p.operatingHours).toEqual({ monday: "08:00-22:00", sunday: "closed" });
  });

  it("does not carry the PMS plumbing the public response leaks", async () => {
    mockGet.mockResolvedValue(PHARMACY_WIRE);
    const p = (await careApi.getPharmacy("pharm-1")) as unknown as Record<string, unknown>;
    expect(p.pmsBaseUrl).toBeUndefined();
    expect(p.pmsPartnerSecretId).toBeUndefined();
  });
});

describe("checkStock", () => {
  it("sends drug_name as a query param on the pharmacy's stock route", async () => {
    mockGet.mockResolvedValue({
      pharmacy_id: "pharm-1",
      drug_name: "Amoxicillin 500mg",
      available: true,
      quantity: 48,
      price_cents: 4200,
      currency: "GHS",
      source: "pms",
    });
    const s = await careApi.checkStock("pharm-1", "Amoxicillin 500mg");
    expect(mockGet).toHaveBeenCalledWith(
      "/v1/pharmacies/pharm-1/stock?drug_name=Amoxicillin%20500mg",
    );
    expect(s.available).toBe(true);
    expect(s.priceCents).toBe(4200);
  });

  it("preserves 'unknown' rather than collapsing it into a negative answer", async () => {
    mockGet.mockResolvedValue({
      pharmacy_id: "pharm-1",
      drug_name: "Amoxicillin 500mg",
      available: false,
      quantity: null,
      price_cents: null,
      currency: null,
      source: "unknown",
    });
    const s = await careApi.checkStock("pharm-1", "Amoxicillin 500mg");
    // 200 + available:false is two different statements depending on `source`,
    // and only one of them means "they do not have it".
    expect(s.source).toBe("unknown");
    expect(s.quantity).toBeNull();
  });

  it("treats any unexpected source value as unknown, never as a confirmed answer", async () => {
    mockGet.mockResolvedValue({
      pharmacy_id: "pharm-1",
      drug_name: "X",
      available: false,
      quantity: 0,
      price_cents: null,
      currency: null,
      source: "cache",
    });
    const s = await careApi.checkStock("pharm-1", "X");
    expect(s.source).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// The people half — two facts the adapters used to invent, and one they dropped
// ---------------------------------------------------------------------------
// Same reason this file exists at all: a screen suite renders whatever the hook
// hands it, so an adapter that substitutes a value has nothing above it that can
// notice. All three of these are adapter-level and were invisible from a screen.

describe("adaptDoctor / getDoctor — nothing invented, nothing dropped", () => {
  const DOCTOR_WIRE = {
    doctor_id: "doc-7",
    user_id: "u-7",
    first_name: "Sarah",
    last_name: "Chen",
    specialty: "cardiology",
    bio: null,
    languages: ["English"],
    consultation_fee_cents: 12000,
    photo_url: null,
    is_listable: true,
    is_active: true,
  };

  it("leaves avatarUri EMPTY rather than substituting a stranger's photograph", async () => {
    mockGet.mockResolvedValue({ items: [DOCTOR_WIRE] });
    const [entry] = await careApi.listDoctors();

    // `PLACEHOLDER_AVATAR` was one Stitch-CDN portrait of a real person,
    // returned for every clinician with no `photo_url` — which on the seeded
    // roster is most of them, so the same stranger's face appeared down the
    // whole directory over other people's names. `AvatarWithFallback` draws the
    // clinician's own initials for "".
    expect(entry.kind).toBe("person");
    if (entry.kind !== "person") throw new Error("expected a person entry");
    expect(entry.avatarUri).toBe("");
    expect(entry.avatarUri).not.toMatch(/googleusercontent/);
  });

  it("keeps a real photo_url untouched", async () => {
    mockGet.mockResolvedValue({
      items: [{ ...DOCTOR_WIRE, photo_url: "https://cdn.test/sarah.png" }],
    });
    const [entry] = await careApi.listDoctors();
    if (entry.kind !== "person") throw new Error("expected a person entry");
    expect(entry.avatarUri).toBe("https://cdn.test/sarah.png");
  });

  it("makes no presence claim — there is no presence data in this system", async () => {
    mockGet.mockResolvedValue({ items: [DOCTOR_WIRE] });
    const [entry] = await careApi.listDoctors();

    // Every adapter set `availability: "online"` from a constant, and the card
    // rendered a green dot labelled "<name> is online" for it.
    expect(entry).not.toHaveProperty("availability");
  });

  it("carries consultation_fee_cents through, unconverted", async () => {
    mockGet.mockResolvedValue({ items: [DOCTOR_WIRE] });
    const [entry] = await careApi.listDoctors();
    if (entry.kind !== "person") throw new Error("expected a person entry");

    // Dropped on the floor until this pass, so the booking funnel had no price
    // to show. MINOR UNITS — the adapter must not divide; exactly one place
    // does, and it is the screen that prints it.
    expect(entry.consultationFeeCents).toBe(12000);
  });

  it("keeps null as null — 'no fee recorded' is not a free consultation", async () => {
    mockGet.mockResolvedValue({ items: [{ ...DOCTOR_WIRE, consultation_fee_cents: null }] });
    const [entry] = await careApi.listDoctors();
    if (entry.kind !== "person") throw new Error("expected a person entry");
    expect(entry.consultationFeeCents).toBeNull();
  });

  it("carries the fee and the empty avatar on the single-resource GET too", async () => {
    // `getDoctor` is what hydrates a stored `doctor_id` on the appointments
    // list, and it had the same placeholder.
    mockGet.mockResolvedValue(DOCTOR_WIRE);
    const d = await careApi.getDoctor("doc-7");

    expect(mockGet).toHaveBeenCalledWith("/v1/doctors/doc-7");
    expect(d.avatarUri).toBe("");
    expect(d.consultationFeeCents).toBe(12000);
  });
});

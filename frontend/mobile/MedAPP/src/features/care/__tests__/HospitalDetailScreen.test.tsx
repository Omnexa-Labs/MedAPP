// HospitalDetailScreen — the record, the roster that has no names, and the
// four columns that do not exist.
//
// Frames: `hospital_detail` 1020:641, not-found 1022:17252, dark 1022:17473.
//
// What these assert is not markup. It is the ways a facility page can mislead:
//
//   1. naming a clinician the backend cannot name. `GET /v1/hospitals/{id}/staff`
//      returns roles and departments and NO names, and says so with
//      `names_available: false`. A roster of anonymous rows with no explanation
//      reads as concealment; a roster with invented names is the defect that
//      already spread across three screens once.
//   2. keeping the "Staff directory not published" EmptyState after real rows
//      arrived — chrome outliving its data, the mirror of the "View Staff"
//      label defect.
//   3. offering a Call button for a hospital whose `contact_phone` is null.
//   4. rendering a record for a hospital that 404'd — a name over empty fields.
//
// SEAM: the three hooks, not `client`. Mocking the network would also exercise
// the adapters, which have their own coverage, and would make this suite fail
// for reasons that are not about the screen.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import type { HospitalDetail, HospitalReview, HospitalStaffRoster } from "@/features/care/api";

const mockParams = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock("expo-router", () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    back: () => mockBack(),
    replace: (...a: unknown[]) => mockReplace(...a),
    canGoBack: () => mockCanGoBack(),
  },
  useLocalSearchParams: () => mockParams(),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

// The `@/components/shell` barrel reaches auth-store -> api/client -> config,
// which throws unless app.config.ts extras are present. Same reason
// MedicationDetailsScreen.test.tsx mocks it; the two `register*Provider`
// functions are part of the surface auth-store calls at import time.
jest.mock("@/lib/api/client", () => ({
  client: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  registerAuthTokenProvider: jest.fn(),
  registerDeviceIdProvider: jest.fn(),
}));

const mockShareText = jest.fn(() => Promise.resolve("shared"));
jest.mock("@/lib/share", () => ({
  shareText: (...a: unknown[]) => mockShareText(...(a as [])),
}));

// Stood in for a real build. Under Jest there is no manifest, so the real
// builder correctly returns null and any URL assertion would pass vacuously;
// its own rules are locked in src/lib/__tests__/share-links.test.ts.
const mockShareLinkLine = jest.fn(
  (t: { kind: string; id: string }) => `Open in MedApp: medapp://${t.kind}-detail?hospitalId=${t.id}`,
);
jest.mock("@/lib/share-links", () => ({
  shareLinkLine: (...a: unknown[]) => mockShareLinkLine(...(a as [{ kind: string; id: string }])),
}));

const mockUseHospital = jest.fn();
const mockUseHospitalReviews = jest.fn();
const mockUseHospitalStaff = jest.fn();
jest.mock("@/features/care/hooks/use-hospital-detail", () => ({
  useHospital: (...a: unknown[]) => mockUseHospital(...a),
  useHospitalReviews: (...a: unknown[]) => mockUseHospitalReviews(...a),
  useHospitalStaff: (...a: unknown[]) => mockUseHospitalStaff(...a),
}));

import { HospitalDetailScreen } from "../HospitalDetailScreen";

// -- Fixtures --------------------------------------------------------------
// Ridge Hospital, matching `find_care` and docs/PIPELINE.md's naming rule.
// Every field here has a column in `hospital_service`'s `hospital_profiles`.

const RIDGE: HospitalDetail = {
  hospitalId: "hosp-1",
  name: "Ridge Hospital",
  description:
    "Ridge Hospital is a general hospital in Osu, Accra, running outpatient clinics, a maternity unit and an on-site dispensary.",
  specialty: "General",
  insuranceAccepted: ["NHIS", "Acacia Health", "GLICO Healthcare"],
  addressLine1: "12 Ridge Road, Osu",
  city: "Accra",
  country: "Ghana",
  websiteUrl: "ridgehospital.gh",
  contactPhone: "+233 30 222 8382",
  contactEmail: "records@ridgehospital.gh",
  accreditation: "HeFRA",
  accreditationStatus: "accredited",
};

/** The exact substring the endpoint sends today. */
const SERVER_REASON =
  "hospital_service stores only a user reference for each staff member; display names are not published by this endpoint";

const ROSTER: HospitalStaffRoster = {
  items: [
    { staffId: "s1", role: "doctor", title: "Consultant Cardiologist", department: "Cardiology" },
    { staffId: "s2", role: "nurse", title: null, department: "Maternity" },
  ],
  namesAvailable: false,
  namesUnavailableReason: SERVER_REASON,
};

const REVIEWS: HospitalReview[] = [
  {
    reviewId: "r1",
    rating: 4,
    title: "Clear triage and short wait",
    body: "Seen within twenty minutes at the outpatient desk.",
    createdAt: new Date(Date.now() - 14 * 864e5).toISOString(),
  },
];

const settled = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
});
const pending = () => ({
  data: undefined,
  isPending: true,
  isError: false,
  error: null,
  refetch: jest.fn(),
});
const failed = (status?: number) => ({
  data: undefined,
  isPending: false,
  isError: true,
  error: status === undefined ? new Error("network") : { status },
  refetch: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
  mockParams.mockReturnValue({ hospitalId: "hosp-1" });
  mockUseHospital.mockReturnValue(settled(RIDGE));
  mockUseHospitalReviews.mockReturnValue(settled(REVIEWS));
  mockUseHospitalStaff.mockReturnValue(settled(ROSTER));
});

// -- Shell contract --------------------------------------------------------

describe("chrome", () => {
  it("is a pushed detail screen: one back button, no tab set of either kind", () => {
    render(<HospitalDetailScreen />);
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
    for (const tab of [
      "Home",
      "Overview",
      "Inbox",
      "Community",
      "Lifestyle",
      "Schedule",
      "Patients",
      "Profile",
    ]) {
      expect(screen.queryByLabelText(tab)).toBeNull();
    }
    // Detail AppBar 193:120 carries no logo.
    expect(screen.queryByLabelText("MedApp")).toBeNull();
  });

  it("falls back to Find Care on direct entry, not to Home", () => {
    mockCanGoBack.mockReturnValue(false);
    render(<HospitalDetailScreen />);
    fireEvent.press(screen.getByLabelText("Go back"));
    // "/(app)" would land a deep-linked user on a tab they were never on.
    expect(mockReplace).toHaveBeenCalledWith("/(app)/find-care");
  });

  it("shares a link to THIS hospital, keyed on the id the screen loaded from", () => {
    render(<HospitalDetailScreen />);
    fireEvent.press(screen.getByLabelText("Share Ridge Hospital"));

    expect(mockShareLinkLine).toHaveBeenCalledWith({ kind: "hospital", id: "hosp-1" });
    const [message] = mockShareText.mock.calls[0] as unknown as [string];
    // Safe to link because this screen is `GET /v1/hospitals/{id}` — it opens
    // cold on the id alone, or shows its own not-found panel. Nothing about the
    // person sharing is in the URL.
    expect(message).toContain("medapp://hospital-detail?hospitalId=hosp-1");
    expect(message).not.toMatch(/token|session|jwt|bearer|patient/i);
  });
});

// -- The record ------------------------------------------------------------

describe("the record", () => {
  it("renders the fields the single-resource GET carries", () => {
    render(<HospitalDetailScreen />);
    expect(screen.getAllByText("Ridge Hospital").length).toBeGreaterThan(0);
    expect(screen.getByText(/running outpatient clinics/)).toBeTruthy();
    expect(screen.getByText("12 Ridge Road, Osu · Accra, Ghana")).toBeTruthy();
    expect(screen.getByText("+233 30 222 8382")).toBeTruthy();
    expect(screen.getByText("records@ridgehospital.gh")).toBeTruthy();
    expect(screen.getByText("ridgehospital.gh")).toBeTruthy();
    expect(screen.getByText("NHIS")).toBeTruthy();
  });

  it("shows nothing the table has no column for", () => {
    render(<HospitalDetailScreen />);
    // Every one of these was refused by name in docs/PIPELINE.md §5. They have
    // no column, so they can only be invented.
    expect(screen.queryByText(/km away|km$/i)).toBeNull();
    expect(screen.queryByText(/open now/i)).toBeNull();
    expect(screen.queryByText(/24\/7/i)).toBeNull();
    expect(screen.queryByText(/beds?\b/i)).toBeNull();
    expect(screen.queryByText(/opening hours/i)).toBeNull();
    // No aggregate rating: the table has per-review scores and no avg column.
    expect(screen.queryByText(/^\d\.\d(\s|$)/)).toBeNull();
  });

  it("does not state accreditation the status has not granted", () => {
    mockUseHospital.mockReturnValue(
      settled({ ...RIDGE, accreditationStatus: "pending" }),
    );
    render(<HospitalDetailScreen />);
    // "HeFRA accredited" is a regulatory claim; "pending" is the DB default.
    expect(screen.queryByText("HeFRA accredited")).toBeNull();
    expect(screen.getByText("HeFRA · pending")).toBeTruthy();
  });
});

// -- The dock --------------------------------------------------------------

describe("the Call dock", () => {
  it("dials the number on the record", () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    render(<HospitalDetailScreen />);
    fireEvent.press(screen.getByText("Call Ridge Hospital"));
    expect(open).toHaveBeenCalledWith("tel:+233302228382");
    open.mockRestore();
  });

  it("does not render at all when contact_phone is null", () => {
    mockUseHospital.mockReturnValue(settled({ ...RIDGE, contactPhone: null }));
    render(<HospitalDetailScreen />);
    // The column is nullable. A dock whose only button cannot do anything is
    // worse than no dock.
    expect(screen.queryByTestId("hospital-detail-dock")).toBeNull();
    expect(screen.queryByText(/^Call/)).toBeNull();
    // ...and the Phone row goes with it, rather than becoming a labelled blank.
    expect(screen.queryByText("Phone")).toBeNull();
  });
});

// -- The care team ---------------------------------------------------------

describe("care team", () => {
  it("renders the real roster instead of the EmptyState the frame drew", () => {
    render(<HospitalDetailScreen />);
    // 1020:16283 described a world with no GET route. There is one now.
    expect(screen.queryByText("Staff directory not published")).toBeNull();
    expect(screen.getByText("Consultant Cardiologist")).toBeTruthy();
    expect(screen.getByText("Cardiology · Doctor")).toBeTruthy();
    // No title on the second row: the role becomes the line rather than a blank.
    expect(screen.getByText("Nurse")).toBeTruthy();
    expect(screen.getByText("Maternity")).toBeTruthy();
  });

  it("says why nobody is named, in words, and names nobody", () => {
    render(<HospitalDetailScreen />);
    expect(screen.getByTestId("hospital-care-team-names-callout")).toBeTruthy();
    expect(screen.getByText(/Names aren't published for this roster/)).toBeTruthy();

    // The six seeded roster names are the ones that have leaked into screens
    // before. None of them may appear on a page that has no name field.
    for (const name of [
      "Kwabena Osei",
      "Adjoa Boateng",
      "Yaw Darko",
      "Efua Asante",
      "Nii Tetteh",
      "Abena Owusu",
    ]) {
      expect(screen.queryByText(name)).toBeNull();
    }
    // The service-speak reason is not what a patient reads.
    expect(screen.queryByText(new RegExp("hospital_service"))).toBeNull();
  });

  it("passes an UNRECOGNISED reason through verbatim rather than guessing", () => {
    // If the server ever says something else — the hospital opted out, say —
    // the app's confident sentence would be a wrong answer.
    mockUseHospitalStaff.mockReturnValue(
      settled({ ...ROSTER, namesUnavailableReason: "the hospital has opted out of name sharing" }),
    );
    render(<HospitalDetailScreen />);
    expect(
      screen.getByText(/the hospital has opted out of name sharing/),
    ).toBeTruthy();
  });

  it("keeps the EmptyState for the case it actually describes", () => {
    mockUseHospitalStaff.mockReturnValue(settled({ ...ROSTER, items: [] }));
    render(<HospitalDetailScreen />);
    expect(screen.getByText("Staff directory not published")).toBeTruthy();
    // No orphaned callout above an empty list.
    expect(screen.queryByTestId("hospital-care-team-names-callout")).toBeNull();
  });

  it("fails on its own without taking the record with it", () => {
    // The roster is the one authenticated GET here; an expired token 401s it
    // while the public record and reviews still render.
    mockUseHospitalStaff.mockReturnValue(failed(401));
    render(<HospitalDetailScreen />);
    expect(screen.getByText("Care team unavailable")).toBeTruthy();
    expect(screen.getByText(/running outpatient clinics/)).toBeTruthy();
    expect(screen.getByText("Clear triage and short wait")).toBeTruthy();
  });
});

// -- Reviews ---------------------------------------------------------------

describe("reviews", () => {
  it("renders a review with its score and age, and attributes it to nobody", () => {
    render(<HospitalDetailScreen />);
    expect(screen.getByText("Clear triage and short wait")).toBeTruthy();
    expect(screen.getByText("4 / 5")).toBeTruthy();
    expect(screen.getByText("2 weeks ago")).toBeTruthy();
    // `hospital_reviews` holds a reviewer_user_id and nothing else, and the
    // adapter drops it. There is no author, no avatar and no "verified" tick.
    expect(screen.queryByText(/verified/i)).toBeNull();
  });

  it("omits the whole section rather than heading an empty list", () => {
    mockUseHospitalReviews.mockReturnValue(settled([]));
    render(<HospitalDetailScreen />);
    expect(screen.queryByText("Patient reviews")).toBeNull();
  });
});

// -- Failure states --------------------------------------------------------

describe("failure", () => {
  it("tells a stale deep link the hospital is gone instead of showing empty fields", () => {
    mockUseHospital.mockReturnValue(failed(404));
    render(<HospitalDetailScreen />);
    expect(screen.getByText("We couldn't load this hospital")).toBeTruthy();
    // Critically: no record scaffolding behind it.
    expect(screen.queryByText("Location & contact")).toBeNull();
    expect(screen.queryByText("Care team")).toBeNull();
    expect(screen.queryByTestId("hospital-detail")).toBeNull();
  });

  it("does not print an HTTP route at a patient", () => {
    // 1022:17260's copy layer carries "GET /v1/hospitals/{id} returned 404",
    // which is a designer's annotation. Dropped deliberately — and it would be
    // wrong for the dropped-connection case that renders the same panel.
    mockUseHospital.mockReturnValue(failed(404));
    render(<HospitalDetailScreen />);
    expect(screen.queryByText(/GET \/v1\//)).toBeNull();
    expect(screen.queryByText(/404/)).toBeNull();
  });

  it("offers no retry when there is nothing to retry", () => {
    mockParams.mockReturnValue({});
    render(<HospitalDetailScreen />);
    expect(screen.getByText(/No hospital was selected/)).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("shows the loading body, not 'not found', before the record arrives", () => {
    mockUseHospital.mockReturnValue(pending());
    render(<HospitalDetailScreen />);
    expect(screen.getByTestId("hospital-detail-loading")).toBeTruthy();
    expect(screen.queryByText("We couldn't load this hospital")).toBeNull();
    // The section headers are the parts whose height is not in question.
    expect(screen.getByText("Location & contact")).toBeTruthy();
  });
});

// -- Source-level guards ---------------------------------------------------

describe("source", () => {
  const SOURCE = readFileSync(join(__dirname, "..", "HospitalDetailScreen.tsx"), "utf8");
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("names no endpoint of its own and reaches for no list query", () => {
    // The `/v1/appointments` incident: a fabricated endpoint passed a fully
    // mocked suite. Paths belong in api.ts, which is where they are verified.
    expect(CODE).not.toMatch(/["'`]\/v1\//);
    expect(CODE).not.toMatch(/\bclient\.(get|post|put|patch|delete)\b/);
    // And specifically NOT the lossy, is_active-filtered list adapter.
    expect(CODE).not.toMatch(/listHospitals\b/);
  });

  it("imports no icon library and hardcodes no colour", () => {
    expect(CODE).not.toMatch(/from ["']@expo\/vector-icons|from ["']healthicons/);
    expect(CODE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

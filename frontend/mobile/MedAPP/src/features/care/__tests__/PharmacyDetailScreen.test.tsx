// PharmacyDetailScreen — the week, the stock answer that is not an answer, and
// the two nullable columns the dock hangs off.
//
// Frames: `pharmacy_detail` 1022:16476, no-pharmacists 1022:17278,
// dark 1022:17511. Local component `HoursRow` 1019:650.
//
// The claims under test:
//
//   1. "we could not reach the pharmacy" must not render as "out of stock".
//      The endpoint answers 200 for both and distinguishes them ONLY by
//      `source`. On a medicine search that is the difference between calling
//      ahead and driving somewhere else.
//   2. all seven days render whenever the map exists, including the ones nobody
//      typed — a table with gaps reads as "closed on the missing days".
//   3. the dock's two halves are independent, because `phone` and the address
//      columns are independently nullable.
//   4. the storefront plate keeps its fallback for a null photo_url AND for a
//      URL that stops resolving.
//   5. no pharmacist is invented. The seed contains none at all
//      (docs/PIPELINE.md §5), so the empty state is the live case.
//
// SEAM: the hooks module, for the same reason as the hospital suite.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, screen, within } from "@testing-library/react-native";
import { Linking } from "react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import type { PharmacyDetail, StockCheck } from "@/features/care/api";
import type { PersonEntry } from "@/features/care/types";

const mockParams = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: () => mockBack(),
    replace: (...a: unknown[]) => mockReplace(...a),
    canGoBack: () => mockCanGoBack(),
  },
  useLocalSearchParams: () => mockParams(),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

jest.mock("@/lib/api/client", () => ({
  client: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  registerAuthTokenProvider: jest.fn(),
  registerDeviceIdProvider: jest.fn(),
}));

const mockShareText = jest.fn(() => Promise.resolve("shared"));
jest.mock("@/lib/share", () => ({
  shareText: (...a: unknown[]) => mockShareText(...(a as [])),
}));

// Stood in for a real build — under Jest there is no manifest, so the real
// builder returns null and a URL assertion would pass vacuously. Its own rules
// are locked in src/lib/__tests__/share-links.test.ts.
const mockShareLinkLine = jest.fn(
  (t: { kind: string; id: string }) => `Open in MedApp: medapp://${t.kind}-detail?pharmacyId=${t.id}`,
);
jest.mock("@/lib/share-links", () => ({
  shareLinkLine: (...a: unknown[]) => mockShareLinkLine(...(a as [{ kind: string; id: string }])),
}));

const mockUsePharmacy = jest.fn();
const mockUsePharmacists = jest.fn();
const mockStockMutate = jest.fn();
const mockUseStockCheck = jest.fn();
jest.mock("@/features/care/hooks/use-pharmacy-detail", () => ({
  usePharmacy: (...a: unknown[]) => mockUsePharmacy(...a),
  usePharmacyPharmacists: (...a: unknown[]) => mockUsePharmacists(...a),
  usePharmacyStockCheck: (...a: unknown[]) => mockUseStockCheck(...a),
}));

import { PharmacyDetailScreen, formatDayHours } from "../PharmacyDetailScreen";

// -- Fixtures --------------------------------------------------------------
// Cedar Pharmacy, matching `find_care` and docs/PIPELINE.md's naming rule.

const CEDAR: PharmacyDetail = {
  pharmacyId: "pharm-1",
  name: "Cedar Pharmacy",
  description: null,
  licenseNumber: "PCG-2019-04471",
  licenseCategories: ["retail dispensing", "controlled substances", "vaccination"],
  addressLine1: "24 Oxford Street, Osu",
  city: "Accra",
  country: "Ghana",
  phone: "+233 30 278 1140",
  email: "hello@cedarpharmacy.gh",
  websiteUrl: null,
  insuranceAccepted: ["NHIS"],
  operatingHours: {
    monday: "08:00-22:00",
    tuesday: "08:00-22:00",
    wednesday: "08:00-22:00",
    thursday: "08:00-22:00",
    friday: "08:00-22:00",
    saturday: "09:00-20:00",
    sunday: "closed",
  },
  photoUrl: null,
};

const IN_STOCK: StockCheck = {
  drugName: "Amoxicillin 500mg",
  available: true,
  quantity: 48,
  priceCents: 4200,
  currency: "GHS",
  source: "pms",
};

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

/** The mutation object the screen consumes. */
const stockState = (over: Partial<Record<string, unknown>> = {}) => ({
  mutate: mockStockMutate,
  data: undefined,
  isPending: false,
  isError: false,
  error: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
  mockParams.mockReturnValue({ pharmacyId: "pharm-1" });
  mockUsePharmacy.mockReturnValue(settled(CEDAR));
  mockUsePharmacists.mockReturnValue(settled([]));
  mockUseStockCheck.mockReturnValue(stockState());
});

// -- Shell -----------------------------------------------------------------

describe("chrome", () => {
  it("is a pushed detail screen with no tab set and no logo", () => {
    render(<PharmacyDetailScreen />);
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
    for (const tab of ["Home", "Overview", "Inbox", "Community", "Lifestyle", "Patients"]) {
      expect(screen.queryByLabelText(tab)).toBeNull();
    }
    expect(screen.queryByLabelText("MedApp")).toBeNull();
  });

  it("shares a link to THIS pharmacy, keyed on the id the screen loaded from", () => {
    render(<PharmacyDetailScreen />);
    fireEvent.press(screen.getByLabelText("Share Cedar Pharmacy"));

    expect(mockShareLinkLine).toHaveBeenCalledWith({ kind: "pharmacy", id: "pharm-1" });
    const [message] = mockShareText.mock.calls[0] as unknown as [string];
    // `GET /v1/pharmacies/{id}` — the screen opens cold on the id alone. The
    // URL names the shop, never the person who sent it.
    expect(message).toContain("medapp://pharmacy-detail?pharmacyId=pharm-1");
    expect(message).not.toMatch(/token|session|jwt|bearer|patient/i);
  });
});

// -- The record ------------------------------------------------------------

describe("the record", () => {
  it("renders the fields only the single-resource GET carries", () => {
    render(<PharmacyDetailScreen />);
    // `listPharmacies`'s adapter keeps five of twenty columns; none of these
    // three survive it, which is why the screen must not resolve through it.
    expect(screen.getByText("PCG-2019-04471")).toBeTruthy();
    expect(screen.getByText("Retail dispensing")).toBeTruthy();
    expect(screen.getByText("24 Oxford Street, Osu · Accra, Ghana")).toBeTruthy();
  });

  it("claims no kind of pharmacy the table cannot back", () => {
    render(<PharmacyDetailScreen />);
    // The frame reads "Community Pharmacy"; `pharmacy_profiles` has no type or
    // category column, so the adjective is dropped rather than invented.
    expect(screen.queryByText(/Community Pharmacy/)).toBeNull();
    expect(screen.getByText("Pharmacy · Accra")).toBeTruthy();
  });

  it("shows nothing that was refused for want of a column", () => {
    render(<PharmacyDetailScreen />);
    expect(screen.queryByText(/open now/i)).toBeNull();
    expect(screen.queryByText(/deliver/i)).toBeNull();
    expect(screen.queryByText(/km/i)).toBeNull();
  });
});

// -- Opening hours ---------------------------------------------------------

describe("opening hours", () => {
  it("renders all seven days, with Sunday's 'closed' as a word", () => {
    render(<PharmacyDetailScreen />);
    for (const day of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]) {
      expect(screen.getByText(day)).toBeTruthy();
    }
    expect(screen.getByText("Closed")).toBeTruthy();
    expect(screen.getByText("09:00 – 20:00")).toBeTruthy();
  });

  it("says 'Not listed' for a day the pharmacy never typed", () => {
    const { sunday: _dropped, ...rest } = CEDAR.operatingHours as Record<string, string>;
    mockUsePharmacy.mockReturnValue(settled({ ...CEDAR, operatingHours: rest }));
    render(<PharmacyDetailScreen />);
    // A missing row would read as "shut on Sunday". A missing VALUE says the
    // opposite of what it means, so it is named.
    expect(screen.getByText("Sunday")).toBeTruthy();
    expect(screen.getByText("Not listed")).toBeTruthy();
  });

  it("marks today in words as well as in tint", () => {
    render(<PharmacyDetailScreen />);
    // WCAG 1.4.1 — the frame distinguishes today by colour alone.
    expect(screen.getByLabelText(/, today$/)).toBeTruthy();
  });

  it("drops the whole section when there is no hours map at all", () => {
    mockUsePharmacy.mockReturnValue(settled({ ...CEDAR, operatingHours: null }));
    render(<PharmacyDetailScreen />);
    expect(screen.queryByTestId("pharmacy-hours")).toBeNull();
  });

  describe("formatDayHours", () => {
    it("normalises the documented shapes and passes anything else through", () => {
      expect(formatDayHours("08:00-22:00")).toBe("08:00 – 22:00");
      expect(formatDayHours("closed")).toBe("Closed");
      expect(formatDayHours("Closed")).toBe("Closed");
      expect(formatDayHours(undefined)).toBe("Not listed");
      expect(formatDayHours("  ")).toBe("Not listed");
      // The column is plain JSON with no validation — a parser that only knew
      // two shapes would blank a pharmacy's own words.
      expect(formatDayHours("By appointment")).toBe("By appointment");
    });
  });
});

// -- Stock -----------------------------------------------------------------

describe("stock check", () => {
  it("will not submit an empty drug name", () => {
    render(<PharmacyDetailScreen />);
    // `drug_name` is required with min_length=1 — an empty submit is a
    // guaranteed 422, so the button says so instead.
    fireEvent.press(screen.getByText("Check availability"));
    expect(mockStockMutate).not.toHaveBeenCalled();
  });

  it("asks for the trimmed name the user typed", () => {
    render(<PharmacyDetailScreen />);
    fireEvent.changeText(screen.getByLabelText("Medicine name"), "  Amoxicillin 500mg ");
    fireEvent.press(screen.getByText("Check availability"));
    expect(mockStockMutate).toHaveBeenCalledWith({ drugName: "Amoxicillin 500mg" });
  });

  it("renders a confirmed answer with its quantity and price", () => {
    mockUseStockCheck.mockReturnValue(stockState({ data: IN_STOCK }));
    render(<PharmacyDetailScreen />);
    expect(screen.getByText("In stock")).toBeTruthy();
    expect(screen.getByText("Live from pharmacy")).toBeTruthy();
    expect(screen.getByText("48")).toBeTruthy();
    expect(screen.getByText("GHS 42.00")).toBeTruthy();
  });

  it("does not print a unit the payload has no field for", () => {
    mockUseStockCheck.mockReturnValue(stockState({ data: IN_STOCK }));
    render(<PharmacyDetailScreen />);
    // The frame reads "48 packs". `quantity_on_hand` is a bare integer — packs,
    // tablets and boxes are three different claims and the payload picks none.
    expect(screen.queryByText(/48 packs/)).toBeNull();
  });

  it("NEVER renders an unreachable dispensing system as 'out of stock'", () => {
    mockUseStockCheck.mockReturnValue(
      stockState({
        data: { ...IN_STOCK, available: false, quantity: null, source: "unknown" },
      }),
    );
    render(<PharmacyDetailScreen />);
    // This is the whole point of the `source` field.
    expect(screen.queryByText("Out of stock")).toBeNull();
    expect(screen.getByTestId("pharmacy-stock-unknown")).toBeTruthy();
    expect(screen.getByText(/isn't confirmed either way/)).toBeTruthy();
  });

  it("distinguishes 'they answered: no' from 'we could not ask'", () => {
    mockUseStockCheck.mockReturnValue(
      stockState({ data: { ...IN_STOCK, available: false, quantity: 0, source: "pms" } }),
    );
    render(<PharmacyDetailScreen />);
    expect(screen.getByText("Out of stock")).toBeTruthy();
    expect(screen.queryByTestId("pharmacy-stock-unknown")).toBeNull();
  });

  it("says so when the pharmacy publishes no live stock at all", () => {
    mockUseStockCheck.mockReturnValue(stockState({ isError: true, error: { status: 404 } }));
    render(<PharmacyDetailScreen />);
    // 404 here is "not wired to a pharmacy management system", NOT "no such
    // drug" — the endpoint answers 200 for that.
    expect(screen.getByText(/doesn't publish live stock/)).toBeTruthy();
  });
});

// -- Pharmacists -----------------------------------------------------------

describe("pharmacists", () => {
  it("renders the frame's empty state, which is the live case", () => {
    render(<PharmacyDetailScreen />);
    expect(screen.getByText("No pharmacists listed")).toBeTruthy();
    // The seed contains no pharmacists at all, and `only_listable` defaults
    // true server-side. Nobody may be invented to fill the section.
    for (const name of ["Kwabena Osei", "Abena Owusu"]) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("renders real rows when the query returns some", () => {
    const p: PersonEntry = {
      kind: "person",
      category: "pharmacists",
      id: "ph-1",
      name: "Naa Adjeley",
      title: "Community Pharmacist",
      avatarUri: "https://example.test/a.png",
      badges: [{ label: "English", tone: "secondary" }],
    };
    mockUsePharmacists.mockReturnValue(settled([p]));
    render(<PharmacyDetailScreen />);
    expect(screen.getByText("Naa Adjeley")).toBeTruthy();
    expect(screen.queryByText("No pharmacists listed")).toBeNull();
  });
});

// -- Storefront ------------------------------------------------------------

describe("storefront plate", () => {
  it("keeps the fallback when photo_url is null", () => {
    render(<PharmacyDetailScreen />);
    expect(screen.getByTestId("pharmacy-photo-fallback")).toBeTruthy();
    expect(screen.getByText("No storefront photo provided")).toBeTruthy();
  });

  it("collapses to the same fallback when a URL stops resolving", () => {
    mockUsePharmacy.mockReturnValue(settled({ ...CEDAR, photoUrl: "https://x.test/shop.jpg" }));
    render(<PharmacyDetailScreen />);
    const img = screen.getByLabelText("Cedar Pharmacy storefront");
    expect(screen.queryByTestId("pharmacy-photo-fallback")).toBeNull();
    fireEvent(img, "error");
    // One fallback, two causes: a screen that handles null but not a dead link
    // ships the grey box anyway.
    expect(screen.getByTestId("pharmacy-photo-fallback")).toBeTruthy();
  });
});

// -- The dock --------------------------------------------------------------

describe("the dock", () => {
  it("offers Directions and Call when both columns are populated", () => {
    render(<PharmacyDetailScreen />);
    // Scoped to the bar: "Call" is also the Phone row's trailing action, and a
    // bare getByText would pass on that one alone.
    const dock = within(screen.getByTestId("pharmacy-detail-dock"));
    expect(dock.getByText("Directions")).toBeTruthy();
    expect(dock.getByText("Call")).toBeTruthy();
  });

  it("drops the Call half — and the Phone row — when phone is null", () => {
    mockUsePharmacy.mockReturnValue(settled({ ...CEDAR, phone: null }));
    render(<PharmacyDetailScreen />);
    expect(screen.queryByText("Call")).toBeNull();
    expect(screen.queryByText("Phone")).toBeNull();
    // Directions survives on its own rather than the dock disappearing.
    expect(screen.getByText("Directions")).toBeTruthy();
  });

  it("renders no dock at all when neither column is populated", () => {
    mockUsePharmacy.mockReturnValue(
      settled({ ...CEDAR, phone: null, addressLine1: null, city: null, country: null }),
    );
    render(<PharmacyDetailScreen />);
    expect(screen.queryByTestId("pharmacy-detail-dock")).toBeNull();
  });

  it("dials the number on the record", () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    render(<PharmacyDetailScreen />);
    fireEvent.press(within(screen.getByTestId("pharmacy-detail-dock")).getByText("Call"));
    expect(open).toHaveBeenCalledWith("tel:+233302781140");
    open.mockRestore();
  });
});

// -- Failure ---------------------------------------------------------------

describe("failure", () => {
  it("renders the not-found panel instead of a name over empty fields", () => {
    mockUsePharmacy.mockReturnValue(failed(404));
    render(<PharmacyDetailScreen />);
    expect(screen.getByText("We couldn't load this pharmacy")).toBeTruthy();
    expect(screen.queryByText("Opening hours")).toBeNull();
    expect(screen.queryByTestId("pharmacy-detail")).toBeNull();
    expect(screen.queryByText(/GET \/v1\//)).toBeNull();
  });

  it("shows the loading body before the record arrives", () => {
    mockUsePharmacy.mockReturnValue(pending());
    render(<PharmacyDetailScreen />);
    expect(screen.getByTestId("pharmacy-detail-loading")).toBeTruthy();
  });
});

// -- Source-level guards ---------------------------------------------------

describe("source", () => {
  const SOURCE = readFileSync(join(__dirname, "..", "PharmacyDetailScreen.tsx"), "utf8");
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("names no endpoint and never reaches for the listable-filtered list", () => {
    expect(CODE).not.toMatch(/["'`]\/v1\//);
    expect(CODE).not.toMatch(/\bclient\.(get|post|put|patch|delete)\b/);
    // `listPharmacies` defaults only_listable=true and would omit the very
    // pharmacy the user tapped.
    expect(CODE).not.toMatch(/listPharmacies\b/);
  });

  it("imports no icon library and hardcodes no colour", () => {
    expect(CODE).not.toMatch(/from ["']@expo\/vector-icons|from ["']healthicons/);
    expect(CODE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

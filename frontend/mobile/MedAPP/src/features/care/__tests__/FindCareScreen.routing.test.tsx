// Find Care -> provider profile: the tap, and the params it carries.
//
// This is the defect the whole round exists to fix. `find-care` had no inbound
// link and — one screen further along — a directory you can look at is not a
// directory you can act on. A route that renders is not a route that is
// REACHABLE, and a push that arrives without identifying params lands the
// profile on DEFAULT_PROVIDER, i.e. a different clinician's name over the card
// the user tapped. Both are invisible to a render test, so they are asserted
// here as pushes.
//
// The suite also pins the per-kind decision: `useDirectory` returns a
// `DirectoryEntry` union spanning five backend collections and they are not one
// destination. Doctors and nurses are people and get a profile (the profile
// decides bookability); hospitals and pharmacies are buildings and must never be
// pushed at a practitioner profile.

import { fireEvent, render, screen } from "@testing-library/react-native";
import type { DirectoryEntry, FacilityEntry, PersonEntry } from "../types";

let mockEntries: DirectoryEntry[] = [];

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

// The screen is one of the three wired to a live backend. The seam is the hook,
// not `client` — mocking the network would also exercise the adapters, which
// have their own coverage and would make this suite fail for reasons that have
// nothing to do with navigation.
jest.mock("../hooks/use-directory", () => ({
  useDirectory: () => ({
    entries: mockEntries,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ displayName: "Ama Mensah", avatarUrl: undefined }),
}));

import { router } from "expo-router";
import { FindCareScreen } from "../FindCareScreen";

const doctor: PersonEntry = {
  kind: "person",
  category: "doctors",
  id: "doc-7",
  name: "Dr. Sarah Chen",
  title: "Cardiology Specialist",
  avatarUri: "https://example.test/sarah.png",
  availability: "online",
  badges: [{ label: "Cardiology", tone: "secondary" }],
};

const nurse: PersonEntry = {
  ...doctor,
  category: "nurses",
  id: "nurse-3",
  name: "Kofi Boateng",
  title: "Paediatric Nurse",
  badges: [{ label: "Home Service", tone: "tertiary" }],
};

const pharmacist: PersonEntry = {
  ...doctor,
  category: "pharmacists",
  id: "pharm-9",
  name: "Naa Adjeley",
  title: "Oncology Pharmacist",
  badges: [],
};

const pharmacy: FacilityEntry = {
  kind: "facility",
  category: "pharmacies",
  id: "store-2",
  name: "Ridge Pharmacy",
  subtitle: "Accra",
  icon: "local-pharmacy",
  iconTint: "secondary",
  badges: [{ label: "Open 08:00-22:00", tone: "open" }],
  cta: { label: "View Store", color: "info" },
};

const hospital: FacilityEntry = {
  ...pharmacy,
  category: "hospitals",
  id: "hosp-1",
  name: "Korle Bu Teaching Hospital",
  icon: "local-hospital",
  iconTint: "tertiary",
  cta: { label: "View Staff", color: "tertiary" },
};

const PROFILE_ROUTE = "/(app)/practitioner-telehealth-profile";

/** The push, as expo-router received it. */
const lastPush = () => (router.push as jest.Mock).mock.calls.at(-1)?.[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockEntries = [];
});

describe("FindCareScreen — a provider card opens that provider's profile", () => {
  it("pushes the profile route when a doctor's View Profile is tapped", () => {
    mockEntries = [doctor];
    render(<FindCareScreen />);

    fireEvent.press(screen.getByLabelText("View Dr. Sarah Chen's profile"));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(lastPush().pathname).toBe(PROFILE_ROUTE);
  });

  it("carries every param the profile needs to identify the practitioner", () => {
    mockEntries = [doctor];
    render(<FindCareScreen />);

    fireEvent.press(screen.getByLabelText("View Dr. Sarah Chen's profile"));

    // `providerId` is the one that becomes `practitionerId` and then
    // `doctor_id`; the rest are what the profile and the slot picker draw.
    // Without them the profile silently renders DEFAULT_PROVIDER.
    expect(lastPush().params).toEqual({
      id: "doc-7",
      providerId: "doc-7",
      providerName: "Dr. Sarah Chen",
      providerSpecialty: "Cardiology Specialist",
      providerAvatar: "https://example.test/sarah.png",
      providerKind: "doctors",
    });
  });

  it("tags the entry's kind so the profile can decide about booking", () => {
    for (const entry of [nurse, pharmacist]) {
      jest.clearAllMocks();
      mockEntries = [entry];
      const view = render(<FindCareScreen />);

      fireEvent.press(screen.getByLabelText(`View ${entry.name}'s profile`));

      expect(lastPush().pathname).toBe(PROFILE_ROUTE);
      expect(lastPush().params.providerKind).toBe(entry.category);
      expect(lastPush().params.providerId).toBe(entry.id);
      view.unmount();
    }
  });

  it("keeps the profile target above the 44pt floor", () => {
    mockEntries = [doctor];
    render(<FindCareScreen />);

    const target = screen.getByLabelText("View Dr. Sarah Chen's profile");
    expect(target.props.style).toEqual(expect.objectContaining({ minHeight: 44 }));
  });
});

describe("FindCareScreen — a facility is not a practitioner", () => {
  it.each([
    ["pharmacy", pharmacy, "View Store — Ridge Pharmacy"],
    ["hospital", hospital, "View Staff — Korle Bu Teaching Hospital"],
  ])("never pushes a %s into a practitioner profile", (_kind, entry, label) => {
    mockEntries = [entry];
    render(<FindCareScreen />);

    fireEvent.press(screen.getByLabelText(label));

    // FLAGGED in the screen: there is no facility detail route in the app, and
    // both practitioner profiles would put a building's name over a person's
    // page. A no-op is honest; a plausible push is not.
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("FindCareScreen — icons come from the shared gate", () => {
  // docs/BRAND.md §Iconography and src/components/ui/icons/Icon.tsx: Icon is the
  // only file allowed to import an icon library. This screen had five direct
  // MaterialIcons call sites, which is how an app ends up with three icon
  // styles — and it is the same violation flagged in HomeScreen.
  const source = require("node:fs")
    .readFileSync(require("node:path").join(__dirname, "..", "FindCareScreen.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("imports no icon library", () => {
    expect(source).not.toMatch(/@expo\/vector-icons/);
    expect(source).not.toMatch(/<MaterialIcons/);
  });
});

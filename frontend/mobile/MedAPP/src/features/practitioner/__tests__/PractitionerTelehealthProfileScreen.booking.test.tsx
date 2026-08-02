// The second half of the booking hand-off: profile -> select-time-slot.
//
// Separate from PractitionerProfileScreens.test.tsx, which asserts the SHELL
// rules both practitioner screens share. This file is about the funnel — what
// the Book CTA pushes, and which providers are allowed to have one.
//
// Why the params are asserted one by one rather than "it navigates":
// SelectTimeSlot keys its availability query on `practitionerId` and
// ReviewAppointment refuses to submit without it, so a push that omits it
// reaches step 3 and dead-ends in the guard. A push that omits the name lands on
// a picker with a blank clinician above the slots. Neither shows up in a render
// test of either screen.

import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { router } from "expo-router";
import { PractitionerTelehealthProfileScreen } from "../PractitionerTelehealthProfileScreen";

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <PractitionerTelehealthProfileScreen />
    </SafeAreaProvider>,
  );

/** Exactly what Find Care's doctor card pushes. */
const DOCTOR_PARAMS = {
  id: "doc-7",
  providerId: "doc-7",
  providerName: "Dr. Sarah Chen",
  providerSpecialty: "Cardiology Specialist",
  providerAvatar: "https://example.test/sarah.png",
  providerKind: "doctors",
};

const lastPush = () => (router.push as jest.Mock).mock.calls.at(-1)?.[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe("Book appointment — the push into the slot picker", () => {
  it("carries the practitioner the user actually tapped", () => {
    mockParams = { ...DOCTOR_PARAMS };
    renderScreen();

    fireEvent.press(screen.getByLabelText("Book appointment"));

    expect(lastPush().pathname).toBe("/(app)/select-time-slot");
    expect(lastPush().params).toEqual({
      practitionerId: "doc-7",
      practitionerName: "Dr. Sarah Chen",
      practitionerSpecialty: "Cardiology Specialist",
      practitionerAvatar: "https://example.test/sarah.png",
    });
  });

  it("renders the tapped provider rather than the seeded default", () => {
    mockParams = { ...DOCTOR_PARAMS };
    renderScreen();

    expect(screen.getByText("Dr. Sarah Chen")).toBeTruthy();
    expect(screen.queryByText("Dr. Julian Sterling")).toBeNull();
  });

  it("omits an absent avatar instead of sending the string \"undefined\"", () => {
    // expo-router serialises `undefined` as the literal "undefined", which the
    // slot picker would hand to <Image> as a URI.
    mockParams = { providerId: "doc-7", providerName: "Dr. Sarah Chen", providerKind: "doctors" };
    renderScreen();

    fireEvent.press(screen.getByLabelText("Book appointment"));

    expect(lastPush().params).not.toHaveProperty("practitionerAvatar");
  });

  it("still books for a deep link that names no kind — that case is a doctor", () => {
    mockParams = { providerId: "doc-7", providerName: "Dr. Sarah Chen" };
    renderScreen();

    expect(screen.getByLabelText("Book appointment")).toBeTruthy();
  });

  it("offers no CTA while the profile is in its error state", () => {
    mockParams = { ...DOCTOR_PARAMS, state: "error" };
    renderScreen();

    expect(screen.queryByLabelText("Book appointment")).toBeNull();
  });
});

describe("Bookability is decided by kind, because the wire field is doctor_id", () => {
  it.each([["nurses"], ["pharmacists"]])(
    "withholds the booking dock for a %s entry",
    (kind) => {
      mockParams = { ...DOCTOR_PARAMS, providerKind: kind, providerName: "Kofi Boateng" };
      renderScreen();

      // `BookingCreate.doctor_id` would be filled with a nurse/pharmacist id
      // three screens later — that does not 404, it writes a wrong record.
      expect(screen.queryByLabelText("Book appointment")).toBeNull();
      expect(screen.queryByTestId("provider-booking-dock")).toBeNull();
    },
  );

  it("says why in words, not by the absence of a button", () => {
    mockParams = { ...DOCTOR_PARAMS, providerKind: "pharmacists" };
    renderScreen();

    expect(
      screen.getByText(/Online booking isn't available for this provider yet/),
    ).toBeTruthy();
  });

  it("still shows who the provider is", () => {
    mockParams = { ...DOCTOR_PARAMS, providerKind: "nurses", providerName: "Kofi Boateng" };
    renderScreen();

    expect(screen.getByText("Kofi Boateng")).toBeTruthy();
  });

  it("makes no video-visit claim about a provider who cannot be booked", () => {
    mockParams = { ...DOCTOR_PARAMS, providerKind: "pharmacists" };
    renderScreen();

    expect(screen.queryByText(/Video visit details/)).toBeNull();
  });
});

describe("No provider fact is invented", () => {
  // The codebase already deleted SEED_RATING for exactly this reason: a score
  // and a review count rendered beside a real clinician's name, sourced from
  // nowhere. Routing the live directory into this screen turned the remaining
  // seed copy into the same class of claim.
  const source = require("node:fs")
    .readFileSync(
      require("node:path").join(__dirname, "..", "PractitionerTelehealthProfileScreen.tsx"),
      "utf8",
    )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("states no years of experience, rating, review count or visit length", () => {
    expect(source).not.toMatch(/12 years experience/);
    expect(source).not.toMatch(/4\.9/);
    expect(source).not.toMatch(/128 patient reviews/);
    expect(source).not.toMatch(/20-minute/);
    expect(source).not.toMatch(/Board-certified/);
  });
});

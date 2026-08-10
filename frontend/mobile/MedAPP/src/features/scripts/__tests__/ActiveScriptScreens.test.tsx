// Guard tests for the two Active Script detail screens.
//
// Two rounds of defects are locked in here.
//
// 1. The SHELL migration. Both screens rendered a `<BottomNav>` under a
//    `DetailAppBar`, which docs/BRAND.md §App shell forbids outright ("Detail
//    screens don't get the bottom nav — they get a back button in the app bar
//    instead"). These tests exist so the nav cannot come back one screen at a
//    time, and so the scroll reserve that used to hold room for it cannot be
//    silently restored.
//
// 2. The FABRICATED PRESCRIPTION (2026-08-08). Between them the two screens
//    carried eighteen `params.X ?? "<clinical constant>"` fallbacks, an
//    unconditional "Verified" chip, a "HIPAA Compliant" footer, a fake SHA-256,
//    two remote QR/"signature" images and a `setTimeout` that told the patient
//    their script had been transmitted to a pharmacy. The runtime cases below
//    assert the not-found state; the source greps assert that no runtime
//    condition can put any of it back.

import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react-native";

/** Mutable so a case can supply route params; reset in `beforeEach`. */
const searchParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => searchParams,
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { ActiveScriptShareScreen } from "../ActiveScriptShareScreen";
import { ActiveScriptViewScreen } from "../ActiveScriptViewScreen";

/** A complete, caller-supplied script. Nothing here comes from the screens. */
const FULL_PARAMS = {
  drug: "Amlodipine 5mg",
  patient: "Ama Mensah",
  scriptId: "#4471-B",
  prescriber: "Dr. Adjoa Boateng",
  issuedDate: "3 Aug 2026",
};

function setParams(values: Record<string, string>) {
  for (const key of Object.keys(searchParams)) delete searchParams[key];
  Object.assign(searchParams, values);
}

beforeEach(() => setParams({}));

/** Every tab label of BOTH tab sets — none may be reachable on a detail screen. */
const ALL_TAB_LABELS = [
  "Home",
  "Overview",
  "Inbox",
  "Community",
  "Lifestyle",
  "Schedule",
  "Patients",
  "Profile",
];

/**
 * The screen's source with comments stripped.
 *
 * Comments are stripped deliberately: both files now carry long notes naming
 * what was deleted and why — the CVS/Walgreens rows, the HIPAA line, the
 * SHA-256 stub. That prose is the record of the defect and must not be deleted
 * to satisfy a grep, so the grep reads CODE only. A test that pushed the
 * explanation out of the file would be the worse outcome.
 */
const source = (file: string) =>
  readFileSync(join(__dirname, "..", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

describe.each([
  [
    "ActiveScriptViewScreen",
    ActiveScriptViewScreen,
    "Digital Prescription",
    "ActiveScriptViewScreen.tsx",
  ],
  [
    "ActiveScriptShareScreen",
    ActiveScriptShareScreen,
    "Share Prescription",
    "ActiveScriptShareScreen.tsx",
  ],
] as const)("%s", (_name, Screen, title, file) => {
  it("renders exactly one shell app bar, titled", () => {
    setParams(FULL_PARAMS);
    render(<Screen />);
    // Two back buttons would mean a hand-rolled bar survived beside the shell's.
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
    expect(screen.getByText(title)).toBeTruthy();
  });

  it("shows no tab set — a detail screen gets a back button instead", () => {
    setParams(FULL_PARAMS);
    render(<Screen />);
    expect(screen.queryByRole("tablist")).toBeNull();
    for (const tab of ALL_TAB_LABELS) {
      expect(screen.queryByLabelText(tab)).toBeNull();
    }
  });

  it("names no bottom nav in source at all", () => {
    // Structural, not a runtime toggle: the token must be absent, so no
    // condition can put the nav back.
    expect(source(file)).not.toMatch(/BottomNav/);
  });

  it("no longer reserves scroll space for the deleted nav", () => {
    // 140 = the nav's 80 outer height + 60 of real breathing room. Keeping 140
    // after deleting the nav leaves an 80px hole under the content.
    expect(source(file)).toMatch(/const SCROLL_RESERVE = 60;/);
    expect(source(file)).not.toMatch(/paddingBottom: 140/);
  });

  it("lets the shell own the status bar rather than freezing it light-mode", () => {
    const text = source(file);
    expect(text).not.toMatch(/StatusBar/);
    expect(text).not.toMatch(/SafeAreaView/);
  });

  // -------------------------------------------------------------------------
  // Missing params render NOT FOUND, never a fabricated script
  // -------------------------------------------------------------------------

  it("renders a not-found state when the route carries no script", () => {
    render(<Screen />);
    expect(screen.getByTestId("script-not-found")).toBeTruthy();
    // The bar's chevron is the only exit — the panel deliberately adds no
    // second control that does the same thing.
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
  });

  it.each([
    ["drug", { ...FULL_PARAMS, drug: "" }],
    ["patient", { ...FULL_PARAMS, patient: "" }],
    ["scriptId", { ...FULL_PARAMS, scriptId: "" }],
    ["prescriber", { ...FULL_PARAMS, prescriber: "" }],
    ["issuedDate", { ...FULL_PARAMS, issuedDate: "" }],
  ])("renders not-found rather than inventing a missing %s", (_field, params) => {
    setParams(params);
    render(<Screen />);
    // A PARTIAL link is the dangerous case: the screen used to fill the gap
    // from a constant and render a coherent-looking prescription that mixed the
    // caller's fields with fabricated ones.
    expect(screen.getByTestId("script-not-found")).toBeTruthy();
  });

  it("shows none of the deleted sample values on a not-found render", () => {
    render(<Screen />);
    for (const invented of [
      "Lisinopril 10mg",
      "Alex Rivers",
      "#8829-X",
      "Hypertension management",
      "30 Tablets",
      "MD-99283-A",
      "Central Cardiology Center",
    ]) {
      expect(screen.queryByText(invented)).toBeNull();
    }
  });

  it("renders exactly what the caller passed when the caller passes it", () => {
    setParams(FULL_PARAMS);
    render(<Screen />);
    expect(screen.queryByTestId("script-not-found")).toBeNull();
    expect(screen.getAllByText(/Amlodipine 5mg/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ama Mensah/).length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // No unbacked security, verification or capability claim
  // -------------------------------------------------------------------------

  it("makes no security or verification claim in source", () => {
    const text = source(file);
    // Each of these shipped. None was true of anything.
    expect(text).not.toMatch(/HIPAA/i);
    expect(text).not.toMatch(/SHA-256/);
    expect(text).not.toMatch(/end-to-end encrypted/i);
    expect(text).not.toMatch(/IDENTITY VERIFIED/);
    expect(text).not.toMatch(/MEDAPP SECURE/);
    expect(text).not.toMatch(/\bVerified\b/);
  });

  it("loads no remote image — a CDN request from a prescription screen", () => {
    const text = source(file);
    // The "signature QR", the "one-time" QR and the app-bar profile photo were
    // all the same Google CDN host, and all three were static assets.
    expect(text).not.toMatch(/googleusercontent/);
    expect(text).not.toMatch(/<Image/);
  });

  it("names no clinical constant as a param fallback", () => {
    const text = source(file);
    // The shape of the defect, not just its values: `params.X ?? "…"`.
    expect(text).not.toMatch(/params\.\w+\s*\?\?\s*"/);
    for (const invented of [
      "Alex Rivers",
      "Lisinopril 10mg",
      "8829-X",
      "12/05/1988",
      "MD-99283-A",
      "Hypertension management",
      "30 Tablets",
      "RX-992",
      "Central Cardiology Center",
    ]) {
      expect(text).not.toContain(invented);
    }
  });
});

it("ActiveScriptViewScreen re-derives the toast offset off the deleted nav", () => {
  // `bottom: 110` was 30 above the top edge of the 80px nav; with no nav the
  // toast would float mid-screen.
  const text = source("ActiveScriptViewScreen.tsx");
  expect(text).toMatch(/const TOAST_BOTTOM = 30;/);
  expect(text).not.toMatch(/bottom: 110/);
});

describe("no screen claims to send a prescription to a pharmacy", () => {
  it("has no fake transmission left in the share screen's source", () => {
    const text = source("ActiveScriptShareScreen.tsx");
    // The whole mechanism: the timer, the success dialog and its copy.
    expect(text).not.toMatch(/setTimeout/);
    expect(text).not.toMatch(/Script Sent/);
    expect(text).not.toMatch(/transmitted to the pharmacy/i);
    expect(text).not.toMatch(/ready for pickup/i);
    // The pharmacies themselves — US chains in a Ghana-seeded product.
    expect(text).not.toMatch(/CVS|Walgreens/);
    expect(text).not.toMatch(/Send Now/);
  });

  it("says so on screen instead", () => {
    setParams(FULL_PARAMS);
    render(<ActiveScriptShareScreen />);
    expect(screen.getByText(/can't send prescriptions to a pharmacy yet/i)).toBeTruthy();
    // And offers no control that could be read as doing it anyway.
    expect(screen.queryByText("Send Now")).toBeNull();
  });

  it("does not advertise a pharmacy integration on the view screen", () => {
    const text = source("ActiveScriptViewScreen.tsx");
    expect(text).not.toMatch(/Send to Pharmacy/);
    expect(text).not.toMatch(/One-Time QR/);
  });
});

// The add-medication flow, and the claims it must never make.
//
// Two things are load-bearing here and neither is cosmetic:
//
//   1. The screen must NOT tell a patient their medication record was updated.
//      There is no medication endpoint; the terminal action is a share. A "Save"
//      that discarded the entry is the control ActiveMedicationsScreen deleted
//      twice, and the notice at the top is what keeps this screen honest.
//   2. The shared FILE must not carry blank clinical rows. A document reading
//      "Form: " invites the reader to treat the blank as deliberate, and the
//      document outlives the screen — it is the artefact that reaches a
//      pharmacist.
//
// The camera branches live in AddMedicationScreen's sibling and are covered in
// MedicationScanScreen.test.tsx; expo-camera has no native module under Jest, so
// what is testable here is the form, the gate on the share button, and the text.

import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

// Same boundary as ActiveMedicationsScreen's test, and for the same reason:
// @/lib/share pulls in expo-sharing + expo-file-system, which have no native
// module under Jest. The mechanism is covered in src/lib/__tests__/share.test.ts.
const mockShareTextFile = jest.fn(() => Promise.resolve("shared" as const));
jest.mock("@/lib/share", () => ({
  shareTextFile: (...args: unknown[]) => mockShareTextFile(...(args as [])),
}));

import { useLocalSearchParams } from "expo-router";
import {
  AddMedicationScreen,
  buildMedicationDraftText,
  canShareDraft,
} from "../AddMedicationScreen";

const EMPTY = {
  name: "",
  dosage: "",
  form: "",
  frequency: "",
  firstDoseTime: "",
  timesOfDay: [],
} as const;

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe("canShareDraft", () => {
  it("refuses a draft with no medication name", () => {
    expect(canShareDraft({ ...EMPTY })).toBe(false);
  });

  it("refuses a name that is only whitespace", () => {
    // Otherwise a space satisfies the gate and the shared file reads
    // "Medication:" with nothing after it.
    expect(canShareDraft({ ...EMPTY, name: "   " })).toBe(false);
  });

  it("accepts a name alone — the other fields are genuinely optional", () => {
    expect(canShareDraft({ ...EMPTY, name: "Amlodipine" })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

describe("buildMedicationDraftText", () => {
  it("states the provenance before any clinical value", () => {
    const text = buildMedicationDraftText({ ...EMPTY, name: "Amlodipine" }, false);
    const provenance = text.indexOf("Entered by the patient");
    const value = text.indexOf("Medication: Amlodipine");
    expect(provenance).toBeGreaterThan(-1);
    expect(provenance).toBeLessThan(value);
  });

  it("says the details were not read from a label", () => {
    // The screen refuses to claim extraction; the file it writes must refuse too,
    // because the file is what gets forwarded.
    expect(buildMedicationDraftText({ ...EMPTY, name: "X" }, true)).toContain(
      "Not read from a prescription label",
    );
  });

  it("omits blank fields entirely rather than emitting empty rows", () => {
    const text = buildMedicationDraftText({ ...EMPTY, name: "Amlodipine" }, false);
    expect(text).not.toContain("Dosage:");
    expect(text).not.toContain("Form:");
    expect(text).not.toContain("Frequency:");
    expect(text).not.toContain("First dose:");
    expect(text).not.toContain("Reminders:");
  });

  it("includes each field the patient actually filled", () => {
    const text = buildMedicationDraftText(
      {
        name: "Amlodipine",
        dosage: "5 mg",
        form: "Tablet",
        frequency: "Once daily",
        firstDoseTime: "08:00",
        timesOfDay: ["Morning"],
      },
      false,
    );
    expect(text).toContain("Medication: Amlodipine");
    expect(text).toContain("Dosage: 5 mg");
    expect(text).toContain("Form: Tablet");
    expect(text).toContain("Frequency: Once daily");
    expect(text).toContain("First dose: 08:00");
    expect(text).toContain("Reminders: Morning");
  });

  it("trims values, so a stray space does not become part of a dose", () => {
    const text = buildMedicationDraftText({ ...EMPTY, name: "  Amlodipine  ", dosage: " 5 mg " }, false);
    expect(text).toContain("Medication: Amlodipine");
    expect(text).toContain("Dosage: 5 mg");
  });

  it("notes the photo is NOT attached, when one was taken", () => {
    // The photo lives on the device; the text file cannot carry it. Saying so
    // stops the recipient waiting for an image that is not coming.
    expect(buildMedicationDraftText({ ...EMPTY, name: "X" }, true)).toContain("is not included");
    expect(buildMedicationDraftText({ ...EMPTY, name: "X" }, false)).not.toContain("is not included");
  });
});

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

describe("AddMedicationScreen", () => {
  it("says up front that nothing is added to the medication record", () => {
    render(<AddMedicationScreen />);
    expect(screen.getByTestId("add-medication-notice")).toBeTruthy();
  });

  it("offers no control claiming to save", () => {
    render(<AddMedicationScreen />);
    expect(screen.queryByText(/^Save/)).toBeNull();
    expect(screen.getByTestId("add-medication-share")).toBeTruthy();
  });

  it("does not share until a medication name is entered, and says why", () => {
    render(<AddMedicationScreen />);
    fireEvent.press(screen.getByTestId("add-medication-share"));
    expect(mockShareTextFile).not.toHaveBeenCalled();
    expect(screen.getByText("Enter the medication name to share these details.")).toBeTruthy();
  });

  it("shares a file carrying what was typed, once a name exists", () => {
    render(<AddMedicationScreen />);
    fireEvent.changeText(screen.getByTestId("add-medication-name"), "Amlodipine");
    fireEvent.changeText(screen.getByTestId("add-medication-dosage"), "5 mg");
    fireEvent.press(screen.getByTestId("add-medication-share"));

    expect(mockShareTextFile).toHaveBeenCalledTimes(1);
    const [call] = mockShareTextFile.mock.calls as unknown as [{ body: string; filename: string }][];
    expect(call[0].filename).toBe("medapp-medication-details.txt");
    expect(call[0].body).toContain("Medication: Amlodipine");
    expect(call[0].body).toContain("Dosage: 5 mg");
  });

  it("tells the patient reminders are not sent, rather than promising alerts", () => {
    // The frame's copy is "Get notified for every dose". expo-notifications is
    // not a dependency, so nothing fires.
    render(<AddMedicationScreen />);
    expect(screen.getByText(/does not send\s+reminders yet/)).toBeTruthy();
  });

  it("prompts to photograph the label when no photo was passed", () => {
    render(<AddMedicationScreen />);
    expect(screen.getByTestId("add-medication-scan-prompt")).toBeTruthy();
    expect(screen.queryByTestId("add-medication-label-preview")).toBeNull();
  });

  it("shows the captured label, and still says nothing is read from it", () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ labelUri: "file:///tmp/label.jpg" });
    render(<AddMedicationScreen />);
    expect(screen.getByTestId("add-medication-label-preview")).toBeTruthy();
    expect(screen.getByText(/Nothing is read from this photo/)).toBeTruthy();
  });

  it("treats an empty labelUri param as no photo at all", () => {
    // `useLocalSearchParams` returns "" for a present-but-empty key. Rendering an
    // <Image source={{ uri: "" }} /> for that is a broken image frame.
    (useLocalSearchParams as jest.Mock).mockReturnValue({ labelUri: "" });
    render(<AddMedicationScreen />);
    expect(screen.getByTestId("add-medication-scan-prompt")).toBeTruthy();
  });
});

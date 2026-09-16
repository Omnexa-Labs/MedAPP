// Locks the navigation out of patient-profile-overview.
//
// Two things:
//   1. The CHROME. This screen is a detail screen (PO ruling 2026-08-05, and the
//      one frame 261:387 has drawn all along — it has no tab bar instance), so:
//      no tab bar, no logo, one back button. The assertion here used to be the
//      opposite — that all five tabs route from this screen — and that premise is
//      what the ruling overturned. The tab-map contract itself still holds and is
//      tested where it belongs, on the tab roots: PatientShell.test.tsx.
//   2. The "Find a provider" CTA. As "Book Appointment" it pushed
//      `/(app)/select-time-slot` with NO params; that screen resolves its slot
//      grid from `params.practitionerId`, so the CTA reliably landed on the
//      empty state. It goes to the directory: pick a provider, then a slot.
//   3. The FICTIONAL PATIENT (2026-08-08). This screen rendered the signed-in
//      user's real name over a constant record — Patient ID MED-208471,
//      jordan.davis@email.com with a "Verified" badge, an address in Texas,
//      blood type O+, a PCP, and an emergency contact whose 555 number was a
//      LIVE `tel:` link. The last two are why the cases below exist: a blood
//      type has transfusion consequences, and a fake emergency number is a
//      control that fails at the worst possible moment.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, fireEvent } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

const SOURCE_PATH = join(__dirname, "..", "PatientProfileOverviewScreen.tsx");

/** The screen's source with comments stripped — the header cites what it removed. */
function codeOnly(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ 	]*\/\/.*$/gm, "");
}

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockUser: import("@/types/user").User | null = null;

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: () => true,
  },
}));

jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => mockUser,
}));

import { PatientProfileOverviewScreen } from "../PatientProfileOverviewScreen";

describe("PatientProfileOverviewScreen navigation", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockReplace.mockClear();
    mockUser = null;
  });

  it("wears detail chrome: no tab bar, no logo, one back button", () => {
    render(<PatientProfileOverviewScreen />);

    // Both tab sets — the failure being locked out is "a detail screen grew a tab
    // bar", and which bar it grew does not matter.
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
    // `Detail AppBar 193:120`: "No logo — the logo belongs only on tab-root
    // screens." <Logo /> carries accessibilityLabel="MedApp".
    expect(screen.queryByLabelText("MedApp")).toBeNull();
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
  });

  it("backs out to the tab root the account menu was opened from", () => {
    // The account menu reaches this screen with `navigate`, which pushes when the
    // route is not already in history — so `back()` is the return path. Not a
    // hardcoded href: every tab root can open the menu, so there is no single up.
    render(<PatientProfileOverviewScreen />);

    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("sends the provider CTA to the directory, not to a parameterless slot picker", () => {
    render(<PatientProfileOverviewScreen />);

    fireEvent.press(screen.getByLabelText("Find a provider"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/find-care");
    expect(mockPush).not.toHaveBeenCalledWith("/(app)/select-time-slot");
  });

  it("opens the patient editor from the signed-in profile", () => {
    mockUser = {
      id: "patient",
      email: "patient@example.com",
      displayName: "Ama Kofi",
      createdAt: "",
    };
    render(<PatientProfileOverviewScreen />);
    fireEvent.press(screen.getByRole("button", { name: "Edit profile" }));
    expect(mockPush).toHaveBeenCalledWith("/(app)/edit-patient-profile");
    mockUser = null;
  });
});

describe("PatientProfileOverviewScreen presents no fictional patient", () => {
  it("dials nobody — there is no tel: link on this screen", () => {
    // CODE only. The file's header names the number that used to be dialled,
    // and that record is the point of the header; a comment cannot place a
    // call. What must not exist is the mechanism.
    expect(codeOnly()).not.toMatch(/tel:/);
    expect(codeOnly()).not.toMatch(/Linking/);
    expect(codeOnly()).not.toMatch(/555/);
  });

  it("renders none of the constant record", () => {
    render(<PatientProfileOverviewScreen />);
    for (const invented of [
      "Jordan Davis",
      "MED-208471",
      "jordan.davis@email.com",
      "+1 (555) 219-3847",
      "482 Maple Grove Lane, Austin, TX 73301",
      "March 14, 1991",
      "O+",
      "34 yrs",
      "72 kg",
      "Dr. Sarah Chen",
      "Maria Davis",
      "+1 (555) 738-2910",
    ]) {
      expect(screen.queryByText(invented)).toBeNull();
    }
    // And no "Verified" badge beside an address the product never held.
    expect(screen.queryByText("Verified")).toBeNull();
  });

  it("marks missing personal details without inventing values", () => {
    render(<PatientProfileOverviewScreen />);
    expect(screen.getByTestId("profile.personal-details")).toBeTruthy();
    expect(screen.getAllByText("Not provided")).toHaveLength(4);
    expect(screen.getByText("No emergency contact is saved.")).toBeTruthy();
  });

  it("names no invented identity in source, so no branch can restore it", () => {
    const src = codeOnly();
    for (const invented of [
      "Jordan Davis",
      "MED-208471",
      "jordan.davis",
      "Maple Grove",
      "Sarah Chen",
      "Maria Davis",
      "EMERGENCY_CONTACT",
      "PRIMARY_CARE_PROVIDER",
    ]) {
      expect(src).not.toContain(invented);
    }
  });
});

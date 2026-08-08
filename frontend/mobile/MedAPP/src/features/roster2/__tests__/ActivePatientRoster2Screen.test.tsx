// The roster after its fourteen fabricated patients were removed.
//
// This file is mostly negative assertions, and that is the point: the value of
// the change is entirely in what is no longer reachable. The names are pinned
// individually rather than by counting cards, because a regression here would
// arrive as a restored fixture, not as a restored layout.
//
// What was there: fourteen complete patient records — names, ages, wards,
// conditions, clinical notes — twelve of them sharing one byte-identical vitals
// triple, and one carrying an invented critical alarm (HR 126 / BP 160/98 /
// SpO₂ 91%) that CONTRADICTED the same patient's record screen one tap away.
// Plus three controls that reported success without a request: Confirm intake,
// its unconditional "Try again", and Review now.

import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
}));
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { ActivePatientRoster2Screen } from "../ActivePatientRoster2Screen";

const renderRoster = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }}
    >
      <ActivePatientRoster2Screen />
    </SafeAreaProvider>,
  );

beforeEach(() => jest.clearAllMocks());

describe("ActivePatientRoster2Screen", () => {
  it("says the roster is NOT CONNECTED, which is not the same as empty", () => {
    renderRoster();
    expect(screen.getByTestId("roster-unavailable-card")).toBeTruthy();
    expect(screen.getByText("The roster is not connected")).toBeTruthy();
    // The distinction a practitioner has to be able to make. A designed empty
    // state ("No patients today") would assert the roster was consulted.
    expect(screen.getByText(/this is not an empty roster/)).toBeTruthy();
    expect(screen.queryByText("No patients match your search")).toBeNull();
    expect(screen.queryByText("No matches for these filters")).toBeNull();
  });

  it("renders none of the fourteen fabricated patients", () => {
    renderRoster();
    for (const name of [
      "Amina Mensah",
      "Efua Adjei",
      "Nana Osei",
      "Kojo Darko",
      "Kwame Asante",
      "Adwoa Boateng",
      "Yaw Ntim",
      "Eunice Kusi",
      "Felix Annan",
      "Grace Owusu",
      "Henry Addo",
      "Irene Amoako",
      "Joseph Arhin",
      "Linda Quaye",
      // The pending intake, whose acceptance was announced but never sent.
      "Marcus Chen",
    ]) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("renders none of the fabricated vitals, including the invented alarm", () => {
    renderRoster();
    // The alarm that contradicted the patient's own record screen.
    expect(screen.queryByText("126")).toBeNull();
    expect(screen.queryByText("160/98")).toBeNull();
    expect(screen.queryByText("91%")).toBeNull();
    // The constant twelve of fourteen shared.
    expect(screen.queryByText("124/78")).toBeNull();
    expect(screen.queryByText("98%")).toBeNull();
    expect(screen.queryByText(/Critical · abnormal vital signs/)).toBeNull();
  });

  it("offers no action that reports success without a request", () => {
    renderRoster();
    // "Review now" WAS the confirmation — one press, no intermediate step, and
    // "{Name}'s critical-care review was recorded".
    expect(screen.queryByLabelText("Review now")).toBeNull();
    expect(screen.queryByText("Review saved")).toBeNull();
    // Intake accept/decline set local state and announced a roster change.
    expect(screen.queryByLabelText("Accept")).toBeNull();
    expect(screen.queryByLabelText("Decline")).toBeNull();
    expect(screen.queryByText("Intake accepted")).toBeNull();
    expect(screen.queryByText(/is now in your active care roster/)).toBeNull();
  });

  it("offers no filter over data it does not have", () => {
    renderRoster();
    // Including the "Active" and "All" chips, which were identical — there was
    // no `active` branch anywhere in the filter.
    expect(screen.queryByLabelText("All patients")).toBeNull();
    expect(screen.queryByLabelText("Active")).toBeNull();
    expect(screen.queryByLabelText("Pending")).toBeNull();
    expect(screen.queryByLabelText("Search patient or ward")).toBeNull();
    expect(screen.queryByLabelText("Filters")).toBeNull();
  });

  it("stays the practitioner Patients tab root", () => {
    renderRoster();
    // docs/BRAND.md §App shell: a tab root keeps its tab set and gets no back
    // button. The screen losing its content must not change what it IS.
    expect(screen.getByLabelText("Patients").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("Schedule")).toBeTruthy();
    expect(screen.queryByLabelText("Go back")).toBeNull();
  });

  it("points at something that does work", () => {
    renderRoster();
    expect(screen.getByLabelText("Go to my schedule")).toBeTruthy();
  });
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const params: {
  state?: string;
  scope?: string;
  clinical?: string;
  query?: string;
  ward?: string;
  condition?: string;
  sort?: string;
} = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => params,
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
}));
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { router } from "expo-router";
import { ActivePatientRoster2Screen } from "../ActivePatientRoster2Screen";

beforeEach(() => {
  Object.keys(params).forEach((key) => delete params[key as keyof typeof params]);
  jest.clearAllMocks();
});
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

describe("ActivePatientRoster2Screen enhanced filtering", () => {
  it("renders independent scope and clinical filters and saves a review", () => {
    renderRoster();
    expect(screen.getByText("14 patients · 3 need review")).toBeTruthy();
    expect(screen.getByLabelText("All patients")).toBeTruthy();
    expect(screen.getByLabelText("Pending")).toBeTruthy();
    expect(screen.getByLabelText("Needs review · 3")).toBeTruthy();
    expect(screen.getByText("Nana Osei")).toBeTruthy();
    expect(screen.queryByText("Kojo Darko")).toBeNull();
    fireEvent.press(screen.getAllByLabelText("Review now")[0]);
    expect(screen.getByText("Review saved")).toBeTruthy();
  });

  it("applies ward, condition and latest filters through the sheet", () => {
    renderRoster();
    fireEvent.press(screen.getByLabelText("Filters"));
    expect(screen.getByText("Refine the roster without losing your search.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Ward 2A"));
    fireEvent.press(screen.getByLabelText("Cardiology"));
    fireEvent.press(screen.getByLabelText("Apply filters"));
    expect(screen.getByText("Applied: Ward 2A · Cardiology · Priority")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Filters · 2"));
    fireEvent.press(screen.getByLabelText("Latest"));
    fireEvent.press(screen.getByLabelText("Apply filters"));
    expect(screen.getByText("Applied: Ward 2A · Cardiology · Latest")).toBeTruthy();
    expect(screen.getByText("Amina Mensah")).toBeTruthy();
    expect(screen.queryByText("Kwame Asante")).toBeNull();
  });

  it("supports pending intake confirmation and success", () => {
    renderRoster();
    fireEvent.press(screen.getByLabelText("Pending"));
    expect(screen.getByText("1 pending intake request")).toBeTruthy();
    expect(screen.getByText("Marcus Chen")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Accept"));
    expect(screen.getByText("Accept intake?")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Confirm"));
    expect(screen.getByText("Intake accepted")).toBeTruthy();
    expect(screen.getByText("13 active patients · 1 intake accepted")).toBeTruthy();
    expect(screen.getByLabelText("All patients").props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByLabelText("View patient"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(app)/patient-record",
      params: { id: "marcus-chen" },
    });
  });

  it("supports search, stable record navigation and a no-results recovery", () => {
    renderRoster();
    fireEvent.press(screen.getByLabelText("Needs review · 3"));
    fireEvent.changeText(screen.getByLabelText("Search patient or ward"), "Adwoa");
    fireEvent.press(screen.getByLabelText("View record"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(app)/patient-record",
      params: { id: "adwoa-boateng" },
    });
    fireEvent.changeText(screen.getByLabelText("Search patient or ward"), "Nobody");
    expect(screen.getByText("No patients match your search")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Clear filters"));
    expect(screen.getByText("Amina Mensah")).toBeTruthy();
  });

  it("renders loading, offline, empty, accepted and error deep-link states", () => {
    params.state = "loading";
    const loading = renderRoster();
    expect(screen.getByLabelText("Loading patient roster")).toBeTruthy();
    loading.unmount();
    params.state = "offline";
    const offline = renderRoster();
    expect(screen.getByText("Roster unavailable")).toBeTruthy();
    offline.unmount();
    params.state = "empty";
    const empty = renderRoster();
    expect(screen.getByText("No matches for these filters")).toBeTruthy();
    empty.unmount();
    params.state = "intake-accepted";
    const accepted = renderRoster();
    expect(screen.getByText("Intake accepted")).toBeTruthy();
    accepted.unmount();
    params.state = "intake-error";
    renderRoster();
    expect(screen.getByText("Couldn’t update intake")).toBeTruthy();
    expect(screen.getByText("Intake response not saved")).toBeTruthy();
    expect(screen.getByLabelText("Try again")).toBeTruthy();
    expect(screen.getByLabelText("Cancel")).toBeTruthy();
  });

  it("filters pending intake search and reaches the error path while offline", () => {
    params.state = "offline";
    params.scope = "pending";
    const searched = renderRoster();
    fireEvent.changeText(screen.getByLabelText("Search patient or ward"), "Nobody");
    expect(screen.getByText("No patients match your search")).toBeTruthy();
    searched.unmount();
    renderRoster();
    fireEvent.press(screen.getByLabelText("Accept"));
    fireEvent.press(screen.getByLabelText("Confirm"));
    expect(screen.getByText("Couldn’t update intake")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(screen.queryByText("Roster unavailable")).toBeNull();
    expect(screen.getByText("Intake accepted")).toBeTruthy();
    expect(screen.getByLabelText("All patients").props.accessibilityState.selected).toBe(true);
  });

  // This file renders TWO different shells and that is deliberate, so the split
  // is pinned: the roster is the practitioner "Patients" tab root and keeps its
  // tab set; `ReviewSaved` is a pushed terminal confirmation and must have a
  // back button and no tabs (docs/BRAND.md §App shell).
  it("keeps the roster on the practitioner tab set and ReviewSaved on the detail shell", () => {
    renderRoster();
    expect(screen.getByLabelText("Patients").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("Schedule")).toBeTruthy();
    expect(screen.queryByLabelText("Go back")).toBeNull();

    fireEvent.press(screen.getAllByLabelText("Review now")[0]);
    expect(screen.getByText("Review saved")).toBeTruthy();
    expect(screen.getByText("Review patient")).toBeTruthy();
    expect(screen.getByLabelText("Go back")).toBeTruthy();
    for (const tab of ["Home", "Schedule", "Patients", "Profile"]) {
      expect(screen.queryByLabelText(tab)).toBeNull();
    }

    // And back out again — the tab set returns with the roster.
    fireEvent.press(screen.getByLabelText("Back to roster"));
    expect(screen.getByLabelText("Patients")).toBeTruthy();
  });
});

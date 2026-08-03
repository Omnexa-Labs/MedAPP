import { fireEvent, render, screen, within } from "@testing-library/react-native";

const params: { state?: string } = {};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => params,
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { router } from "expo-router";
import { ActiveMedicationsScreen } from "../ActiveMedicationsScreen";

beforeEach(() => {
  params.state = undefined;
  (router.canGoBack as jest.Mock).mockReturnValue(true);
  jest.clearAllMocks();
});

describe("ActiveMedicationsScreen", () => {
  it("renders typed local medication data and records a refill request locally", () => {
    render(<ActiveMedicationsScreen />);

    expect(screen.getByText("Your current medications")).toBeTruthy();
    expect(screen.getByText("Metformin")).toBeTruthy();
    expect(screen.getByText("Take 1 tablet with breakfast and dinner.")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Request refill for Metformin"));
    expect(screen.getByText("Request sent")).toBeTruthy();
    expect(screen.getByText("We'll notify you once it's ready.")).toBeTruthy();
    expect(screen.getByText("Cancel before the pharmacy starts processing.")).toBeTruthy();
  });

  it("renders an accessible empty state when explicitly requested", () => {
    params.state = "empty";
    render(<ActiveMedicationsScreen />);

    expect(screen.getByText("No active medications")).toBeTruthy();
    expect(screen.getByText("Ask your clinician to share a prescription.")).toBeTruthy();
    expect(screen.getByText("Clinician verification is required.")).toBeTruthy();
    expect(screen.getByLabelText("Add a medication")).toBeTruthy();
  });

  it("renders a retryable error state when explicitly requested", () => {
    params.state = "error";
    render(<ActiveMedicationsScreen />);

    expect(screen.getByText("Couldn't refresh medications")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Try loading medications again"));
    expect(screen.getByText("Amlodipine")).toBeTruthy();
  });

  it("shows cached medications but disables refill actions offline", () => {
    params.state = "offline";
    render(<ActiveMedicationsScreen />);

    expect(screen.getByText("Couldn't refresh medications")).toBeTruthy();
    expect(screen.getByText("You're offline. We're showing your last saved list.")).toBeTruthy();
    expect(screen.getByText("Showing your last saved list")).toBeTruthy();
    expect(screen.getByText("Offline · Updated 12 Jul at 09:42")).toBeTruthy();
    expect(screen.getAllByText("Unavailable offline").length).toBeGreaterThan(0);
    expect(screen.getByText("Reconnect to request a refill or update this list.")).toBeTruthy();
    expect(screen.queryByLabelText("Request refill for Metformin")).toBeNull();
  });

  it("shows a labelled loading state", () => {
    params.state = "loading";
    render(<ActiveMedicationsScreen />);
    expect(screen.getByLabelText("Loading medications")).toBeTruthy();
  });

  // The two-line clamp is a property of the card, not of any one drug name, so
  // it is still asserted after "Metformin extended-release" became plain
  // "Metformin" — the clamp is what keeps a genuinely long name from pushing the
  // action row off a 360dp screen.
  it("clamps medication names to two lines and opens the details placeholder", () => {
    render(<ActiveMedicationsScreen />);
    expect(screen.getByText("Metformin").props.numberOfLines).toBe(2);
    fireEvent.press(screen.getByLabelText("View details for Metformin"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/(app)/medication-details", params: { id: "metformin-500" } });
  });

  it("keeps the refill and filled details CTAs together in the action row", () => {
    render(<ActiveMedicationsScreen />);
    const actions = within(screen.getByTestId("medication-actions-metformin-500"));
    expect(actions.getByText("Request refill")).toBeTruthy();
    expect(actions.getByText("View details")).toBeTruthy();
    expect(screen.getByText("Add or import a medication from your clinician.")).toBeTruthy();
  });

  it("is a detail screen: one shell bar with the share action, no tab set", () => {
    render(<ActiveMedicationsScreen />);
    // Exactly one back button == exactly one app bar.
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
    expect(screen.getByText("Active medications")).toBeTruthy();
    // The share action is forwarded through the shell to the bar, not lost.
    expect(screen.getByLabelText("Share medication list")).toBeTruthy();
    // Back button INSTEAD of tabs — docs/BRAND.md §App shell.
    for (const tab of ["Home", "Overview", "Community", "Lifestyle", "Schedule", "Patients", "Profile"]) {
      expect(screen.queryByLabelText(tab)).toBeNull();
    }
  });

  it("uses Overview as a safe back fallback for deep links", () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    render(<ActiveMedicationsScreen />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(router.replace).toHaveBeenCalledWith("/(app)/overview");
  });
});

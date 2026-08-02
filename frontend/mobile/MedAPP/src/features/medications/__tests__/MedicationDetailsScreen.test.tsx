import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: "metformin-500" }),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { router } from "expo-router";
import { MedicationDetailsScreen } from "../MedicationDetailsScreen";

it("uses Overview as the direct-entry back fallback", () => {
  render(<MedicationDetailsScreen />);
  fireEvent.press(screen.getByLabelText("Go back"));
  expect(router.replace).toHaveBeenCalledWith("/(app)/overview");
});

it("is a detail screen: one shell bar, no tab set", () => {
  render(<MedicationDetailsScreen />);
  // Exactly one back button == exactly one app bar. Two would mean the screen
  // kept a hand-rolled bar alongside the shell's.
  expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
  expect(screen.getByText("Medication details")).toBeTruthy();
  // A detail screen gets a back button INSTEAD of tabs — docs/BRAND.md §App
  // shell. No tab of either tab set may be reachable.
  for (const tab of ["Home", "Overview", "Inbox", "Community", "Lifestyle", "Schedule", "Patients", "Profile"]) {
    expect(screen.queryByLabelText(tab)).toBeNull();
  }
});

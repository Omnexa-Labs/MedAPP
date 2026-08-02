// AppointmentManagementScreen, locked to DetailShell.
//
// This screen is the one the PO explicitly ruled OUT of the patient tab set
// (see the header of the screen file), so "no bottom nav, ever" is a product
// decision here and not just a shell convention. It is asserted, not assumed.

import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { router } from "expo-router";
import { AppointmentManagementScreen } from "../AppointmentManagementScreen";

beforeEach(() => jest.clearAllMocks());

it("wears exactly one detail bar and neither tab set", () => {
  render(<AppointmentManagementScreen />);
  expect(screen.getByText("Appointments")).toBeTruthy();
  expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
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
});

it("backs out to wherever it was pushed from", () => {
  render(<AppointmentManagementScreen />);
  fireEvent.press(screen.getByLabelText("Go back"));
  expect(router.back).toHaveBeenCalled();
});

describe("Book new", () => {
  it("offers a booking affordance at all, and routes it to the directory", () => {
    render(<AppointmentManagementScreen />);

    fireEvent.press(screen.getByLabelText("Book new appointment"));

    // NOT select-time-slot. That screen is a slot picker for a KNOWN
    // practitioner — Reschedule hands it practitionerName/Specialty/Avatar
    // because a reschedule already has a doctor. A new booking does not, so
    // pushing it directly would land the picker in its no-practitioner state.
    // Provider first, slot second.
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/(app)/find-care");
  });

  it("stays visible on both tabs — booking belongs to neither", () => {
    render(<AppointmentManagementScreen />);

    expect(screen.getByLabelText("Book new appointment")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Past"));
    expect(screen.getByLabelText("Book new appointment")).toBeTruthy();
  });
});

it("still passes the practitioner through when RESCHEDULING a known appointment", () => {
  render(<AppointmentManagementScreen />);

  fireEvent.press(screen.getAllByLabelText("Reschedule appointment")[0]);

  expect(router.push).toHaveBeenCalledWith({
    pathname: "/(app)/select-time-slot",
    params: {
      practitionerName: "Dr. Julian Sterling",
      practitionerSpecialty: "Senior Cardiologist",
      practitionerAvatar: expect.any(String),
    },
  });
});

it("keeps the Upcoming/Past segmented control", () => {
  render(<AppointmentManagementScreen />);
  // "Upcoming" is a tab of the screen's own segmented control, not of a nav
  // bar — role `tab`, and the assertion above already proved no nav exists.
  expect(screen.getByLabelText("Upcoming").props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByLabelText("Past"));
  expect(screen.getByLabelText("Past").props.accessibilityState.selected).toBe(true);
  expect(screen.getByText("Dr. Aris Thorne")).toBeTruthy();
});

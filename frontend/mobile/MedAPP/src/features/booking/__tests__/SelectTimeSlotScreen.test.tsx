import { fireEvent, render, screen } from "@testing-library/react-native";
import type { SlotsResult } from "../hooks/use-booking-availability";
let mockParams: Record<string, string> = {};
let mockSlots: SlotsResult;
const mockStart = new Date(Date.now() + 86400000).toISOString();
const mockEnd = new Date(Date.parse(mockStart) + 1800000).toISOString();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("nativewind", () => ({ useColorScheme: () => ({ colorScheme: "light" }) }));
jest.mock("../hooks/use-booking-availability", () => ({
  useDateStrip: () => [
    { iso: "2030-05-13", day: "Mon", date: "13", month: "May", unavailable: false },
    { iso: "2030-05-14", day: "Tue", date: "14", month: "May", unavailable: false },
  ],
  useSlots: () => mockSlots,
}));
import { router } from "expo-router";
import { SelectTimeSlotScreen } from "../SelectTimeSlotScreen";
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { practitionerId: "d1", practitionerName: "Test Clinician" };
  mockSlots = {
    slots: [
      {
        time: "10:00 AM GMT+5:30",
        endTime: "10:30 AM",
        period: "Morning",
        available: true,
        startsAtIso: mockStart,
        endsAtIso: mockEnd,
        timezone: "Asia/Kolkata",
      },
    ],
    isLoading: false,
    isError: false,
    retry: jest.fn(),
    timezoneLabel: "Asia/Kolkata",
  };
});
function choose() {
  fireEvent.press(screen.getByLabelText("10:00 AM GMT+5:30"));
  fireEvent.press(screen.getByLabelText("Standard Consultation"));
}
it("requires a selected clinician slot and consultation type", () => {
  render(<SelectTimeSlotScreen />);
  expect(screen.getByLabelText("Book Now").props.accessibilityState.disabled).toBe(true);
  choose();
  fireEvent.press(screen.getByLabelText("Book Now"));
  expect((router.push as jest.Mock).mock.calls[0][0].params).toMatchObject({
    startsAtIso: mockStart,
    endsAtIso: mockEnd,
    timezone: "Asia/Kolkata",
    duration: "30 minutes",
  });
});
it("clears selection when the date changes", () => {
  render(<SelectTimeSlotScreen />);
  choose();
  fireEvent.press(screen.getByLabelText("Tue 14 May"));
  expect(screen.getByLabelText("Book Now").props.accessibilityState.disabled).toBe(true);
});
it("shows actual empty availability", () => {
  mockSlots.slots = [];
  render(<SelectTimeSlotScreen />);
  expect(screen.getByText("No slots on Mon 13 May")).toBeTruthy();
  expect(screen.getByLabelText("Book Now").props.accessibilityState.disabled).toBe(true);
});
it("offers retry for a failed calendar instead of fabricated slots", () => {
  mockSlots.isError = true;
  mockSlots.slots = [];
  render(<SelectTimeSlotScreen />);
  fireEvent.press(screen.getByLabelText("Retry availability"));
  expect(mockSlots.retry).toHaveBeenCalled();
  expect(screen.queryByText("No slots on Mon 13 May")).toBeNull();
});
it("blocks confirmation while refreshing", () => {
  mockSlots.isLoading = true;
  render(<SelectTimeSlotScreen />);
  expect(screen.getByLabelText("Book Now").props.accessibilityState.disabled).toBe(true);
});
it("invalidates a removed selection after refresh", () => {
  const view = render(<SelectTimeSlotScreen />);
  choose();
  mockSlots = { ...mockSlots, slots: [] };
  view.rerender(<SelectTimeSlotScreen />);
  fireEvent.press(screen.getByLabelText("Book Now"));
  expect(router.push).not.toHaveBeenCalled();
});
it("does not reuse a display-clock route without a slot instant", () => {
  mockParams = { ...mockParams, time: "10:00 AM GMT+5:30", type: "Standard Consultation" };
  render(<SelectTimeSlotScreen />);
  expect(screen.getByLabelText("Book Now").props.accessibilityState.disabled).toBe(true);
});
it("will not book an elapsed slot", () => {
  mockSlots.slots[0] = { ...mockSlots.slots[0], startsAtIso: "2020-01-01T10:00:00Z" };
  render(<SelectTimeSlotScreen />);
  choose();
  fireEvent.press(screen.getByLabelText("Book Now"));
  expect(router.push).not.toHaveBeenCalled();
});

it("carries the selected slot timezone even when the calendar has multiple zones", () => {
  mockSlots.timezoneLabel = "America/New_York, Asia/Kolkata";
  render(<SelectTimeSlotScreen />);
  choose();
  fireEvent.press(screen.getByLabelText("Book Now"));
  expect((router.push as jest.Mock).mock.calls[0][0].params.timezone).toBe("Asia/Kolkata");
});

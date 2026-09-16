import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Share } from "react-native";
let mockParams: Record<string, string> = {};
let mockOwner = "p1";
const mockCurrent = jest.fn(() => true);
const mockBooking = jest.fn(),
  mockDoctor = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));
jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  bookingApi: { getBooking: (...args: unknown[]) => mockBooking(...args) },
}));
jest.mock("@/lib/api/client", () => ({ client: {} }));
jest.mock("@/features/care/api", () => ({
  careApi: { getDoctor: (...args: unknown[]) => mockDoctor(...args) },
}));
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => ({ owner: mockOwner, revision: 1, isCurrent: mockCurrent }),
}));
import { BookingConfirmedScreen } from "../BookingConfirmedScreen";
import { ApiError } from "@/types/api";
const booking = {
  bookingId: "b1",
  userId: "p1",
  doctorId: "d1",
  startsAtIso: "2035-05-13T10:00:00+05:30",
  endsAtIso: "2035-05-13T10:30:00+05:30",
  status: "booked",
  mode: "video",
  reason: "Follow-up",
  notes: "Saved notes",
};
let client: QueryClient;
function App() {
  return (
    <QueryClientProvider client={client}>
      <BookingConfirmedScreen />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {
    bookingId: "b1",
    practitionerName: "Forged Name",
    date: "2001-01-01",
    mode: "in-person",
  };
  mockOwner = "p1";
  mockCurrent.mockReturnValue(true);
  mockBooking.mockReset().mockResolvedValue(booking);
  mockDoctor.mockReset().mockResolvedValue({
    doctorId: "d1",
    name: "Dr. Saved Name",
    specialty: "Cardiology",
    avatarUri: "",
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});
it("reloads a booking by ID after reopening and ignores display data in the link", async () => {
  render(<App />);
  await screen.findByText("Dr. Saved Name");
  expect(mockBooking).toHaveBeenCalledWith(
    "b1",
    expect.objectContaining({ signal: expect.anything(), isSessionCurrent: mockCurrent }),
  );
  expect(screen.getByText("Video consultation")).toBeTruthy();
  expect(screen.getByText("Follow-up")).toBeTruthy();
  expect(screen.queryByText("Forged Name")).toBeNull();
  expect(screen.getByText("Your device time", { exact: false })).toBeTruthy();
  expect(screen.getByText("Appointment Confirmed")).toBeTruthy();
}, 15_000);
it("does not confirm a link with no booking ID", () => {
  mockParams = { practitionerName: "Forged Name", startsAtIso: booking.startsAtIso };
  render(<App />);
  expect(screen.queryByText("Appointment Confirmed")).toBeNull();
  expect(mockBooking).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Share appointment")).toBeNull();
});
it("shows cancelled state and no preparation or calendar action", async () => {
  mockBooking.mockResolvedValue({ ...booking, status: "cancelled" });
  render(<App />);
  expect(await screen.findByText("Appointment cancelled")).toBeTruthy();
  expect(screen.queryByText("Appointment Confirmed")).toBeNull();
  expect(screen.queryByLabelText("Add to Calendar")).toBeNull();
  expect(screen.queryByText("Before your appointment")).toBeNull();
});
it("does not infer that a past scheduled visit was completed", async () => {
  mockBooking.mockResolvedValue({
    ...booking,
    startsAtIso: "2020-01-01T10:00:00Z",
    endsAtIso: "2020-01-01T10:30:00Z",
  });
  render(<App />);
  expect(await screen.findByText("Past appointment")).toBeTruthy();
  expect(screen.getByText(/does not confirm whether the visit took place/)).toBeTruthy();
  expect(screen.queryByLabelText("Add to Calendar")).toBeNull();
});
it("shows an access or network error and retries without claiming success", async () => {
  mockBooking.mockRejectedValueOnce(new ApiError("forbidden", 403));
  render(<App />);
  await screen.findByText("Unable to load appointment");
  expect(screen.queryByText("Appointment Confirmed")).toBeNull();
  fireEvent.press(screen.getByLabelText("Retry loading appointment"));
  expect(await screen.findByText("Appointment Confirmed")).toBeTruthy();
});
it.each([
  { bookingId: "other" },
  { status: "unknown" },
  { startsAtIso: "2035-05-13T10:00:00" },
  { endsAtIso: "2020-01-01T00:00:00Z" },
])("rejects an invalid saved response %j", async (patch) => {
  mockBooking.mockResolvedValue({ ...booking, ...patch });
  render(<App />);
  expect(await screen.findByText("Unable to load appointment")).toBeTruthy();
  expect(screen.queryByLabelText("Add to Calendar")).toBeNull();
});
it("keeps authoritative booking details if clinician lookup fails", async () => {
  mockDoctor.mockRejectedValue(new Error("offline"));
  render(<App />);
  await screen.findByText("Clinician details unavailable");
  expect(screen.getByText("Appointment Confirmed")).toBeTruthy();
  expect(screen.getByText("Saved notes")).toBeTruthy();
  expect(screen.queryByText("Forged Name")).toBeNull();
});
it("reflects cancellation after refresh", async () => {
  render(<App />);
  await screen.findByText("Dr. Saved Name");
  mockBooking.mockResolvedValue({ ...booking, status: "cancelled" });
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["appointments", "detail"] });
  });
  expect(await screen.findByText("Appointment cancelled")).toBeTruthy();
  expect(screen.queryByLabelText("Add to Calendar")).toBeNull();
});
it("clears private appointment details on account change", async () => {
  const view = render(<App />);
  await screen.findByText("Dr. Saved Name");
  mockOwner = "p2";
  mockBooking.mockReturnValue(new Promise(() => {}));
  view.rerender(<App />);
  expect(screen.queryByText("Saved notes")).toBeNull();
  expect(screen.queryByLabelText("Share appointment")).toBeNull();
});
it("shares saved local times and offsets instead of the route's display values", async () => {
  const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
  render(<App />);
  await screen.findByText("Dr. Saved Name");
  fireEvent.press(screen.getByLabelText("Share appointment"));
  await waitFor(() => expect(share).toHaveBeenCalled());
  const message = share.mock.calls[0][0].message!;
  expect(message).toContain("Dr. Saved Name");
  expect(message).toContain("2035");
  expect(message).toContain("GMT");
  expect(message).not.toContain("2001");
  expect(message).not.toContain("Saved notes");
});

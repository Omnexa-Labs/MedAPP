// AppointmentManagementScreen, locked to DetailShell.
//
// This screen is the one the PO explicitly ruled OUT of the patient tab set
// (see the header of the screen file), so "no bottom nav, ever" is a product
// decision here and not just a shell convention. It is asserted, not assumed.

import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

// The screen reads `GET /v1/bookings` now, so the api module is mocked rather
// than the HTTP client: mocking `client` alone would still pull `lib/config`
// through, which throws outside Expo ("app.config.ts is missing required
// extras"). Mocking at the feature boundary also lets each test state the
// SHAPE it cares about instead of hand-rolling wire JSON.
jest.mock("@/features/appointments/api", () => ({
  appointmentsApi: { listAppointments: jest.fn(), cancelAppointment: jest.fn() },
}));

import { router } from "expo-router";
import { appointmentsApi } from "@/features/appointments/api";
import { AppointmentManagementScreen } from "../AppointmentManagementScreen";

const listAppointments = appointmentsApi.listAppointments as jest.Mock;

const doctor = (name: string, specialty: string) => ({
  doctorId: `d-${name}`,
  name,
  specialty,
  avatarUri: "https://example.test/a.jpg",
});

/** Far enough either side of now that the clock cannot flip a bucket mid-run. */
const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString();
const PAST = new Date(Date.now() - 7 * 864e5).toISOString();

const UPCOMING = {
  id: "b1",
  doctorId: "d-1",
  doctor: doctor("Dr. Julian Sterling", "Senior Cardiologist"),
  startsAtIso: FUTURE,
  endsAtIso: FUTURE,
  status: "confirmed" as const,
};
const COMPLETED = {
  id: "b2",
  doctorId: "d-2",
  doctor: doctor("Dr. Aris Thorne", "Physiotherapist"),
  startsAtIso: PAST,
  endsAtIso: PAST,
  status: "completed" as const,
};

/**
 * Each test gets its own QueryClient with retries off — a retrying client turns
 * an error-state assertion into a multi-second timeout.
 */
let activeClient: QueryClient | null = null;

const renderScreen = (ui: ReactElement = <AppointmentManagementScreen />) => {
  activeClient = new QueryClient({
    defaultOptions: {
      // A retrying client turns an error-state assertion into a multi-second
      // timeout. `gcTime: 0` stops the cache scheduling a collection timer that
      // outlives the test — without it Jest reported "did not exit one second
      // after the test run", which is a hang in CI, not a warning.
      queries: { retry: false, gcTime: 0 },
    },
  });
  return render(<QueryClientProvider client={activeClient}>{ui}</QueryClientProvider>);
};

afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

/** Settle the query so assertions run against the loaded list, not the spinner. */
const renderLoaded = async () => {
  const out = renderScreen();
  await waitFor(() => expect(screen.queryByLabelText("Loading your appointments")).toBeNull());
  return out;
};

beforeEach(() => {
  jest.clearAllMocks();
  listAppointments.mockResolvedValue({ upcoming: [UPCOMING], past: [COMPLETED] });
});

it("wears exactly one detail bar and neither tab set", async () => {
  await renderLoaded();
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

it("backs out to wherever it was pushed from", async () => {
  await renderLoaded();
  fireEvent.press(screen.getByLabelText("Go back"));
  expect(router.back).toHaveBeenCalled();
});

describe("Book new", () => {
  it("offers a booking affordance at all, and routes it to the directory", async () => {
    await renderLoaded();

    fireEvent.press(screen.getByLabelText("Book new appointment"));

    // NOT select-time-slot. That screen is a slot picker for a KNOWN
    // practitioner — Reschedule hands it practitionerName/Specialty/Avatar
    // because a reschedule already has a doctor. A new booking does not, so
    // pushing it directly would land the picker in its no-practitioner state.
    // Provider first, slot second.
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/(app)/find-care");
  });

  it("stays visible on both tabs — booking belongs to neither", async () => {
    await renderLoaded();

    expect(screen.getByLabelText("Book new appointment")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Past"));
    expect(screen.getByLabelText("Book new appointment")).toBeTruthy();
  });
});

it("still passes the practitioner through when RESCHEDULING a known appointment", async () => {
  await renderLoaded();

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

it("keeps the Upcoming/Past segmented control", async () => {
  await renderLoaded();
  // "Upcoming" is a tab of the screen's own segmented control, not of a nav
  // bar — role `tab`, and the assertion above already proved no nav exists.
  expect(screen.getByLabelText("Upcoming").props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByLabelText("Past"));
  expect(screen.getByLabelText("Past").props.accessibilityState.selected).toBe(true);
  expect(screen.getByText("Dr. Aris Thorne")).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Live data
// ---------------------------------------------------------------------------
// The bug these lock: this screen used to render two hardcoded arrays and make
// no request at all, so a booking the user had just made was invisible here.

describe("reads GET /v1/bookings", () => {
  it("renders what the server returned, not a seeded literal", async () => {
    listAppointments.mockResolvedValue({
      upcoming: [{ ...UPCOMING, doctor: doctor("Dr. Efua Asante", "Paediatrics") }],
      past: [],
    });
    await renderLoaded();

    expect(listAppointments).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Dr. Efua Asante")).toBeTruthy();
    // Names the deleted mock arrays used to hardcode.
    expect(screen.queryByText("Dr. Sarah Chen")).toBeNull();
    expect(screen.queryByText("Dr. Emily Watts")).toBeNull();
  });

  it("shows a spinner before the list arrives", () => {
    let settle: (v: unknown) => void = () => {};
    listAppointments.mockReturnValue(new Promise((r) => { settle = r; }));
    renderScreen();
    expect(screen.getByLabelText("Loading your appointments")).toBeTruthy();
    settle({ upcoming: [], past: [] });
  });

  it("offers a retry that actually refetches when the request fails", async () => {
    listAppointments.mockRejectedValue(new Error("Network request failed"));
    renderScreen();

    const retry = await screen.findByLabelText("Retry loading appointments");
    // The real message, not a generic apology — it is how a patient tells an
    // offline phone from a server fault.
    expect(screen.getByText("Network request failed")).toBeTruthy();

    listAppointments.mockResolvedValue({ upcoming: [UPCOMING], past: [] });
    fireEvent.press(retry);
    await waitFor(() => expect(screen.getByText("Dr. Julian Sterling")).toBeTruthy());
  });

  it("empties honestly, and only offers booking on the Upcoming tab", async () => {
    listAppointments.mockResolvedValue({ upcoming: [], past: [] });
    await renderLoaded();

    expect(screen.getByText("No upcoming appointments")).toBeTruthy();
    expect(screen.getByLabelText("Find a clinician")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Past"));
    expect(screen.getByText("No past appointments")).toBeTruthy();
    // Offering "book" under the history tab answers a question nobody asked.
    expect(screen.queryByLabelText("Find a clinician")).toBeNull();
  });

  it("labels a cancelled booking as cancelled, never as completed", async () => {
    listAppointments.mockResolvedValue({
      upcoming: [],
      past: [{ ...COMPLETED, status: "cancelled" as const }],
    });
    await renderLoaded();
    fireEvent.press(screen.getByLabelText("Past"));

    // "Completed" on an appointment nobody attended is a false claim on a
    // medical record, which is why the label branches on status.
    expect(screen.getByText(/^Cancelled/)).toBeTruthy();
    expect(screen.queryByText(/^Completed on /)).toBeNull();
  });

  it("keeps an appointment visible when its clinician cannot be resolved", async () => {
    // hydrate() leaves `doctor` null when doctor_service 404s or is down. The
    // appointment is still real and the patient still needs to see the time.
    listAppointments.mockResolvedValue({ upcoming: [{ ...UPCOMING, doctor: null }], past: [] });
    await renderLoaded();

    expect(screen.getByText("Unknown clinician")).toBeTruthy();
  });
});

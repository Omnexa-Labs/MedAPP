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
const cancelAppointment = appointmentsApi.cancelAppointment as jest.Mock;

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
  mode: "in-person" as const,
};

/** A video visit whose room the telemedicine service DID provision. */
const UPCOMING_VIDEO = {
  ...UPCOMING,
  id: "b3",
  mode: "video" as const,
  roomId: "27db4d6b-2533-4afa-b807-2c14a4a621cd",
};

/**
 * A video visit with NO room — `provision_room` never raises, so the booking
 * service returns 201 with `room_id: null` when telemedicine is unreachable.
 * There is a row in exactly this state in the seeded database.
 */
const UPCOMING_VIDEO_NO_ROOM = { ...UPCOMING, id: "b4", mode: "video" as const };
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

/**
 * Settle the query so assertions run against the loaded list, not the spinner.
 *
 * The explicit budgets are not padding for a slow assertion — every one of these
 * renders is ~1s of react-test-renderer work on this screen, and Jest's default
 * 5s combined with `waitFor`'s default 1s left the suite failing intermittently
 * under `--maxWorkers` contention while passing in isolation. A flaky suite is
 * worse than a slow one: it teaches the reader to re-run instead of to look.
 */
jest.setTimeout(30_000);

const renderLoaded = async () => {
  const out = renderScreen();
  await waitFor(
    () => expect(screen.queryByLabelText("Loading your appointments")).toBeNull(),
    { timeout: 15_000 },
  );
  return out;
};

beforeEach(() => {
  jest.clearAllMocks();
  listAppointments.mockResolvedValue({ upcoming: [UPCOMING], past: [COMPLETED] });
  cancelAppointment.mockResolvedValue(undefined);
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

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------
// THIS TEST IS WHY THE DEFECT SHIPPED GREEN. It was called "still passes the
// practitioner through when RESCHEDULING", and it asserted name, specialty and
// avatar — the three params that only decorate the next screen — while never
// asserting `practitionerId`, the one that is load-bearing. So the push omitted
// the id, screen 1 forwarded nothing (expo-router drops an undefined value),
// and screen 2's required-params guard fired: a patient who had just chosen a
// date, a time, a mode and a type was told "This booking session has expired".
// The suite was pinning the decoration and ignoring the payload.

describe("Reschedule", () => {
  it("passes practitionerId — without it the funnel dead-ends two screens later", async () => {
    await renderLoaded();

    fireEvent.press(screen.getAllByLabelText("Reschedule appointment")[0]);

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(app)/select-time-slot",
      params: {
        // `doctor_id` on the wire. Asserted FIRST and by value, because this is
        // the param whose absence the old assertion could not see.
        practitionerId: "d-1",
        practitionerName: "Dr. Julian Sterling",
        practitionerSpecialty: "Senior Cardiologist",
        practitionerAvatar: expect.any(String),
        // And which booking this replaces — see the reschedule note below.
        rescheduleOfId: "b1",
      },
    });
  });

  it("carries an id that reaches the review screen without the expired state", async () => {
    await renderLoaded();
    fireEvent.press(screen.getAllByLabelText("Reschedule appointment")[0]);

    // ReviewAppointmentScreen's guard is
    // `!practitionerId || !name || !date || !time || !type || !mode` -> expired.
    // The two facts this screen owns are the id and the name; the other four are
    // the user's choices on screen 1. Restating the guard's own condition here
    // is what ties this push to the screen that consumes it — the id being
    // present at all is the entire fix.
    const params = (router.push as jest.Mock).mock.calls[0][0].params;
    expect(params.practitionerId).toBeTruthy();
    expect(params.practitionerId).not.toBe("undefined");
    expect(params.practitionerName).toBeTruthy();
  });

  // A RESCHEDULE IS A REPLACEMENT, NOT A SECOND BOOKING. `booking_service` has
  // no reschedule route, so Review does it in two calls: create the new booking,
  // then cancel this one. Book-first is deliberate — a failed create leaves the
  // original standing, whereas cancel-first can leave a patient with nothing at
  // all when the new slot is taken while they review. This screen's job is only
  // to say WHICH booking is being replaced.
  it("names the booking being replaced, so the old one is not left standing", async () => {
    await renderLoaded();
    fireEvent.press(screen.getAllByLabelText("Reschedule appointment")[0]);

    expect((router.push as jest.Mock).mock.calls[0][0].params.rescheduleOfId).toBe("b1");
  });

  it("sends no rescheduleOfId from the NEW-booking entry point", async () => {
    await renderLoaded();
    fireEvent.press(screen.getByLabelText("Book new appointment"));

    // "Book new" goes to the directory with no params at all — nothing is being
    // replaced, and a stray id here would cancel an unrelated appointment.
    expect(router.push).toHaveBeenCalledWith("/(app)/find-care");
  });
});

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------
// The defect: `onPress={() => { /* TODO: hook into DELETE /v1/appointments/:id
// once ready. */ }}`. The route in that TODO does not exist and never did, while
// `appointmentsApi.cancelAppointment` — written, correct, against the real
// `POST /v1/bookings/{id}/cancel` — had never been called by anything. A patient
// pressed Cancel, saw the press state, was told nothing, and reasonably assumed
// it had worked. The booking stayed `booked` and a clinician held the slot.
//
// Note the module mock at the top of this file already stubbed
// `cancelAppointment` — the seam was there, and nothing exercised it.

describe("Cancel", () => {
  const openCancelDialog = async () => {
    await renderLoaded();
    fireEvent.press(screen.getAllByLabelText("Cancel appointment")[0]);
  };

  it("asks before cancelling — it does not fire on the first press", async () => {
    await openCancelDialog();

    expect(screen.getByText("Cancel this appointment?")).toBeTruthy();
    // Destructive and one finger-width from Reschedule, so the first press opens
    // a confirmation rather than cancelling a real medical appointment.
    expect(cancelAppointment).not.toHaveBeenCalled();
  });

  it("calls cancelAppointment with the booking id when confirmed", async () => {
    await openCancelDialog();

    fireEvent.press(screen.getByLabelText("Yes, cancel appointment"));

    await waitFor(() => expect(cancelAppointment).toHaveBeenCalledTimes(1));
    expect(cancelAppointment).toHaveBeenCalledWith(UPCOMING.id);
  });

  it("backs out without calling anything", async () => {
    await openCancelDialog();

    fireEvent.press(screen.getByLabelText("Keep appointment"));

    expect(screen.queryByText("Cancel this appointment?")).toBeNull();
    expect(cancelAppointment).not.toHaveBeenCalled();
  });

  it("refetches the list once the cancellation lands", async () => {
    await openCancelDialog();
    fireEvent.press(screen.getByLabelText("Yes, cancel appointment"));

    // Without the invalidation the row sits in Upcoming looking confirmed until
    // the next cold start — which is the same "did that work?" the empty handler
    // produced, only after a real state change.
    await waitFor(() => expect(listAppointments).toHaveBeenCalledTimes(2));
  });

  it("SHOWS the failure instead of failing silently", async () => {
    // A silent failure here is the exact defect being fixed: the patient would
    // believe they had cancelled, twice over.
    cancelAppointment.mockRejectedValue(new Error("Network request failed"));
    await openCancelDialog();

    fireEvent.press(screen.getByLabelText("Yes, cancel appointment"));

    expect(await screen.findByText("We couldn’t cancel this appointment")).toBeTruthy();
    // The real message, not a generic apology — it is how a patient tells an
    // offline phone from a server fault.
    expect(screen.getByText(/Network request failed/)).toBeTruthy();
    // And the standing truth, stated: the appointment is still booked.
    expect(screen.getByText(/It is still booked\./)).toBeTruthy();
  });

  it("keeps the dialog open on failure so the patient can retry", async () => {
    cancelAppointment.mockRejectedValue(new Error("nope"));
    await openCancelDialog();
    fireEvent.press(screen.getByLabelText("Yes, cancel appointment"));
    await screen.findByText("We couldn’t cancel this appointment");

    // Dismissing the sheet on an error would leave the failure unread and the
    // list unchanged — indistinguishable from the old dead button.
    expect(screen.getByText("Cancel this appointment?")).toBeTruthy();

    cancelAppointment.mockResolvedValue(undefined);
    fireEvent.press(screen.getByLabelText("Yes, cancel appointment"));
    await waitFor(() => expect(cancelAppointment).toHaveBeenCalledTimes(2));
  });

  it("offers no cancel control on a PAST appointment", async () => {
    await renderLoaded();
    fireEvent.press(screen.getByLabelText("Past"));

    // Cancelling something that already happened is not a thing, and the past
    // card has never drawn the control. Locked so the wiring above does not
    // spread to it.
    expect(screen.queryByLabelText("Cancel appointment")).toBeNull();
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

// ---------------------------------------------------------------------------
// Modality — the badge and the join affordance (Figma 550:1826 / 550:2613)
// ---------------------------------------------------------------------------
//
// The card had neither, because `BookingCreate` used to discard the In person /
// Video choice the patient made and the server therefore could not say which a
// booking was. `mode` and `room_id` are stored now, so both are buildable — and
// the third state is the one that matters: a video booking with `room_id: null`
// is a REAL response (`provision_room` never raises), and it must not produce a
// button that goes nowhere.
describe("consultation modality", () => {
  it("badges an in-person booking as In person, with no join affordance", async () => {
    await renderLoaded();

    expect(screen.getByText("In person")).toBeTruthy();
    expect(screen.queryByText("Video call")).toBeNull();
    expect(screen.queryByText("Join video call")).toBeNull();
    expect(screen.queryByText("Video link pending")).toBeNull();
  });

  it("badges a video booking as Video call and offers the join", async () => {
    listAppointments.mockResolvedValue({ upcoming: [UPCOMING_VIDEO], past: [] });
    await renderLoaded();

    expect(screen.getByText("Video call")).toBeTruthy();
    expect(screen.queryByText("In person")).toBeNull();
    expect(
      screen.getByLabelText("Join video call with Dr. Julian Sterling"),
    ).toBeTruthy();
    expect(screen.queryByText("Video link pending")).toBeNull();
  });

  it("routes Join through the WAITING ROOM, carrying the room_id as sessionId", async () => {
    listAppointments.mockResolvedValue({ upcoming: [UPCOMING_VIDEO], past: [] });
    await renderLoaded();

    fireEvent.press(screen.getByLabelText("Join video call with Dr. Julian Sterling"));

    // The waiting room, NOT the consultation: it is where the mic/camera check
    // and the mute controls live, and it `replace()`s into the call itself once
    // both sides are ready. Straight to the call would drop the patient into
    // live video with an unconfigured camera.
    expect(router.push).toHaveBeenCalledTimes(1);
    const arg = (router.push as jest.Mock).mock.calls[0][0];
    expect(arg.pathname).toBe("/(app)/waiting-room");
    // The handle, not a URL — there is no `join_url` in this system.
    expect(arg.params.sessionId).toBe(UPCOMING_VIDEO.roomId);
    expect(arg.params.appointmentId).toBe(UPCOMING_VIDEO.id);
    expect(arg.params.providerId).toBe(UPCOMING_VIDEO.doctorId);
    expect(arg.params.providerName).toBe("Dr. Julian Sterling");
    expect(arg.params.viewerRole).toBe("patient");
    expect(arg.params).not.toHaveProperty("joinUrl");
  });

  it("renders PENDING, not a dead button, when a video booking has no room yet", async () => {
    listAppointments.mockResolvedValue({ upcoming: [UPCOMING_VIDEO_NO_ROOM], past: [] });
    await renderLoaded();

    // Still a video visit — the missing room does not make it in person.
    expect(screen.getByText("Video call")).toBeTruthy();
    expect(screen.getByText("Video link pending")).toBeTruthy();
    // No control at all, disabled or otherwise. A greyed "Join video call" tells
    // the patient they are doing something wrong; the room is simply not ready.
    expect(screen.queryByText("Join video call")).toBeNull();
    expect(
      screen.queryByLabelText("Join video call with Dr. Julian Sterling"),
    ).toBeNull();
  });

  it("survives a mode it does not recognise instead of blanking the list", async () => {
    // A badge must never be able to cost a patient sight of when they are due.
    listAppointments.mockResolvedValue({
      upcoming: [{ ...UPCOMING, mode: "telehealth" as unknown as "video" }],
      past: [],
    });
    await renderLoaded();

    expect(screen.getByText("Dr. Julian Sterling")).toBeTruthy();
    expect(screen.getByText("In person")).toBeTruthy();
    expect(screen.queryByText("Join video call")).toBeNull();
  });
});

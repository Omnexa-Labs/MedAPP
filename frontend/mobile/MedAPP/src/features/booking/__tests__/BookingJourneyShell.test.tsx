jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => ({ owner: "u1", revision: 1, isCurrent: () => true }),
}));
jest.mock("../hooks/use-booking-availability", () => ({
  useDateStrip: () => [
    { iso: "2030-05-13", day: "Mon", date: "13", month: "May", unavailable: false },
  ],
  useSlots: () => ({
    slots: [
      {
        time: "10:00 AM",
        endTime: "10:30 AM",
        period: "Morning",
        available: true,
        startsAtIso: "2030-05-13T10:00:00Z",
        endsAtIso: "2030-05-13T10:30:00Z",
        timezone: "UTC",
      },
    ],
    isLoading: false,
    isError: false,
    retry: jest.fn(),
  }),
}));
// The booking journey's three screens, locked to DetailShell.
//
// Written with the migration, because these screens had NO tests and the thing
// being removed — a hand-rolled `SafeAreaView` + `StatusBar style="dark"` +
// `DetailAppBar` wrapper — is exactly the kind of thing that grows back one
// screen at a time. Each assertion below is a rule from docs/BRAND.md §App
// shell, not a snapshot of the current markup.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
    dismissAll: jest.fn(),
  },
  // A jest.fn rather than a literal, because ReviewAppointmentScreen now renders
  // the "session expired" frame (756:4813) when its required params are absent —
  // it no longer invents an appointment — so its shell assertions need a real
  // one. Default stays `{}` for the other two screens.
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

// ReviewAppointmentScreen's confirm is a real POST now. The client is mocked as
// a MODULE because importing it pulls in `@/lib/config`, which throws unless
// app.config.ts extras are present under Jest.
jest.mock("@/lib/api/client", () => ({ client: { post: jest.fn() } }));

import { router, useLocalSearchParams } from "expo-router";
import { BookingConfirmedScreen } from "../BookingConfirmedScreen";
import { ReviewAppointmentScreen } from "../ReviewAppointmentScreen";
import { SelectTimeSlotScreen } from "../SelectTimeSlotScreen";

/** Neither tab set may be reachable from a detail screen. */
const EVERY_TAB = [
  "Home",
  "Overview",
  "Inbox",
  "Community",
  "Lifestyle",
  "Schedule",
  "Patients",
  "Profile",
];

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ practitionerId: "d1" });
});

describe("SelectTimeSlotScreen", () => {
  it("wears exactly one detail bar and no tab set", () => {
    render(<SelectTimeSlotScreen />);
    expect(screen.getByText("Book Appointment")).toBeTruthy();
    // Two back buttons would mean a hand-rolled bar survived beside the shell's.
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
    for (const tab of EVERY_TAB) expect(screen.queryByLabelText(tab)).toBeNull();
  });

  // The CTA no longer fires from a blank form: `time` and `type` used to be
  // pre-selected with hardcoded values, which is what made `canProceed` dead
  // code, so the route is now asserted after a real choice. Rehydration and the
  // disabled state have their own suite in SelectTimeSlotScreen.test.tsx.
  it("keeps its docked action bar and its route", () => {
    render(<SelectTimeSlotScreen />);
    // Pick whichever slot is actually free rather than a fixed time. The strip now anchors to
    // today, so a hardcoded "10:00 AM" is unavailable whenever today's 10am has passed — the
    // test failed for that reason, not for anything the screen got wrong. Unavailable slots
    // announce as "…, unavailable" and are not pressable.
    // Slots are ChoiceChips, which take `accessibilityRole="radio"` when they behave as a
    // single-choice group — so query both roles rather than assuming one.
    const firstFree = [...screen.queryAllByRole("radio"), ...screen.queryAllByRole("button")].find(
      (n) => /^\d{1,2}:\d{2}\s?(AM|PM)$/.test(String(n.props.accessibilityLabel ?? "")),
    );
    if (!firstFree) throw new Error("no available time slot rendered");
    fireEvent.press(firstFree);
    fireEvent.press(screen.getByLabelText("Standard Consultation"));
    fireEvent.press(screen.getByLabelText("Book Now"));
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/(app)/review-appointment" }),
    );
  });
});

describe("ReviewAppointmentScreen", () => {
  /**
   * The review screen needs two things the other two don't: a set of params (it
   * renders 756:4813 without them instead of inventing a booking) and a
   * QueryClientProvider (confirm is a mutation now). Both are local to this
   * block so the other suites keep rendering bare.
   */
  const REVIEW_PARAMS = {
    startsAtIso: "2030-05-13T10:00:00Z",
    endsAtIso: "2030-05-13T10:30:00Z",
    // Required: `BookingCreate.doctor_id` is a non-optional UUID, so a session
    // without a practitioner id renders 756:4813 rather than a Confirm button
    // that could only ever fail. Screen 1 always pushes it.
    practitionerId: "1c9e0f24-0000-4000-8000-000000000003",
    practitionerName: "Dr. Julian Sterling",
    practitionerSpecialty: "Senior Cardiologist",
    date: "2025-05-13",
    time: "10:00 AM",
    mode: "in-person",
    type: "Standard Consultation",
  };

  const renderReview = () => {
    (useLocalSearchParams as unknown as jest.Mock).mockReturnValue(REVIEW_PARAMS);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: 0 }, queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <ReviewAppointmentScreen />
      </QueryClientProvider>,
    );
  };

  afterEach(() => (useLocalSearchParams as unknown as jest.Mock).mockReturnValue({}));

  it("wears exactly one detail bar and no tab set", () => {
    renderReview();
    expect(screen.getByText("Review Appointment")).toBeTruthy();
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
    for (const tab of EVERY_TAB) expect(screen.queryByLabelText(tab)).toBeNull();
  });

  // Confirm became an async mutation this pass (frames 756:4442 / 756:4586), so
  // the route assertion moved to ReviewAppointmentScreen.test.tsx where the
  // mutation can be driven. What still belongs HERE is the shell rule: the
  // screen's one commit action lives in the docked bar and nowhere else.
  it("carries exactly one commit action, in the docked bar", () => {
    renderReview();
    expect(screen.getAllByLabelText("Confirm Booking")).toHaveLength(1);
  });

  it("makes no checkout claim under a bar that takes no money", () => {
    // The footnote read "Secure encrypted checkout" beside a padlock. There is
    // no payment step in this flow — no amount, no card, no `payment_service`
    // call — and the service behind it has no provider integrated at all, so
    // there is nothing to encrypt and no checkout to secure. A padlock is the
    // thing a patient looks for before committing money, which makes it the
    // worst possible place for decoration.
    renderReview();
    expect(screen.queryByLabelText("Secure encrypted checkout")).toBeNull();
    expect(screen.queryByText(/checkout/i)).toBeNull();
  });
});

describe("BookingConfirmedScreen", () => {
  it("is terminal: a CLOSE affordance, never a back arrow", () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
      >
        <BookingConfirmedScreen />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Appointment")).toBeTruthy();
    expect(screen.queryByLabelText("Go back")).toBeNull();
    expect(screen.getAllByLabelText("Close")).toHaveLength(1);
    for (const tab of EVERY_TAB) expect(screen.queryByLabelText(tab)).toBeNull();
  });

  it("closes to Home by REPLACE, so Review cannot be re-confirmed", () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
      >
        <BookingConfirmedScreen />
      </QueryClientProvider>,
    );
    fireEvent.press(screen.getByLabelText("Close"));
    expect(router.replace).toHaveBeenCalledWith("/(app)");
    expect(router.back).not.toHaveBeenCalled();
  });
});

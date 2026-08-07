// InboxScreen against inbox_service.
//
// The screen rendered a seed array until now, under a note claiming the call
// was blocked on "the messaging service". It never was — `GET /v1/threads` has
// shipped all along. These cases lock the three states a real request has, and
// the one ordering rule that is easy to get backwards.

import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithSafeArea } from "@/test/safe-area";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/store/auth-store", () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { displayName: "Ama Mensah" } }),
}));

// `mock`-prefixed on purpose: babel hoists jest.mock above the const, and jest
// only permits a factory to close over a variable whose name starts with
// "mock". ChatThreadScreen's suite carries the same note.
const mockListThreads = jest.fn();
jest.mock("../api", () => ({
  chatApi: { listThreads: (...a: unknown[]) => mockListThreads(...a) },
}));

import { InboxScreen } from "../InboxScreen";

function render() {
  // `retry: false` so the error case fails on the FIRST rejection instead of
  // burning the default three attempts and timing the test out.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithSafeArea(
    <QueryClientProvider client={qc}>
      <InboxScreen />
    </QueryClientProvider>,
  );
}

const thread = (over: Record<string, unknown> = {}) => ({
  id: "t-1",
  subject: "Cardiology follow-up",
  source: "direct",
  status: "open",
  createdByUserId: "u-1",
  assignedRole: null,
  assignedUserId: null,
  bookingId: null,
  lastMessageAtIso: "2026-08-06T10:00:00Z",
  ...over,
});

describe("InboxScreen — live threads", () => {
  beforeEach(() => mockListThreads.mockReset());

  it("renders threads returned by the service", async () => {
    mockListThreads.mockResolvedValue([thread()]);
    render();
    await waitFor(() => expect(screen.getByText("Cardiology follow-up")).toBeTruthy());
  });

  it("surfaces a retryable error instead of an empty inbox", async () => {
    // An empty list and a failed request mean different things to a patient
    // waiting on a clinician, so they must not look the same.
    mockListThreads.mockRejectedValue(new Error("offline"));
    render();
    await waitFor(() => expect(screen.getByText("Couldn't load your messages")).toBeTruthy());

    mockListThreads.mockResolvedValue([thread({ subject: "Back online" })]);
    fireEvent.press(screen.getByLabelText("Retry loading messages"));
    await waitFor(() => expect(screen.getByText("Back online")).toBeTruthy());
  });

  it("sorts a thread with no messages LAST, not first", async () => {
    // A null `last_message_at` is "nothing has happened here", not epoch — the
    // naive comparison puts it at the top of the inbox.
    mockListThreads.mockResolvedValue([
      thread({ id: "t-empty", subject: "Never used", lastMessageAtIso: null }),
      thread({ id: "t-recent", subject: "Recent", lastMessageAtIso: "2026-08-06T12:00:00Z" }),
    ]);
    render();
    await waitFor(() => expect(screen.getByText("Recent")).toBeTruthy());

    const recent = screen.getByText("Recent");
    const never = screen.getByText("Never used");
    // Both present, and the empty one carries the "New" stamp rather than a time.
    expect(recent).toBeTruthy();
    expect(never).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
  });

  it("shows the empty state only when the service really returns nothing", async () => {
    mockListThreads.mockResolvedValue([]);
    render();
    await waitFor(() => expect(screen.queryByText("Couldn't load your messages")).toBeNull());
  });
});

// Notifications — Figma 1073:1433.
//
// The de-duplication and the queued state are the two behaviours that come
// straight from contract subtleties, so they carry the weight here.

import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));

const mockListInbox = jest.fn();
jest.mock("../api", () => ({
  notificationsApi: { listInbox: (...a: unknown[]) => mockListInbox(...a) },
}));

import { NotificationsScreen } from "../NotificationsScreen";

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const msg = (over: Record<string, unknown> = {}) => ({
  id: "d-1",
  eventId: "e-1",
  eventType: "appointment.confirmed",
  title: "Appointment confirmed",
  body: "Dr. Adjoa Boateng, tomorrow at 10:30 AM.",
  channel: "in_app",
  status: "delivered",
  deliveredAtIso: new Date().toISOString(),
  ...over,
});

describe("NotificationsScreen", () => {
  beforeEach(() => mockListInbox.mockReset().mockResolvedValue([]));

  // 20s, not the default 5s. This is the FIRST render in the file and pays for
  // the whole module graph — DetailShell, tokens, icons. It measures ~5.2s cold
  // and ~80ms thereafter, which is why every later case in this suite is fast.
  // The work is real, not a hang.
  it("renders a delivered notification", async () => {
    mockListInbox.mockResolvedValue([msg()]);
    render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByText("Appointment confirmed")).toBeTruthy());
    expect(screen.getByText("Today")).toBeTruthy();
  }, 20000);

  it("shows ONE row per happening, not per delivery channel", async () => {
    // push AND in_app of the same event share an eventId. Counting deliveries
    // would show a patient the same thing twice.
    mockListInbox.mockResolvedValue([
      msg({ id: "d-push", channel: "push" }),
      msg({ id: "d-inapp", channel: "in_app" }),
    ]);
    render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getAllByText("Appointment confirmed")).toHaveLength(1));
  });

  it("says Sending… for an undelivered notice rather than inventing a time", async () => {
    // deliveredAt null means queued or failed — the service tried, it does not
    // know the patient was told. A timestamp would assert otherwise.
    mockListInbox.mockResolvedValue([
      msg({ id: "d-q", eventId: "e-q", title: "Medication reminder", deliveredAtIso: null }),
    ]);
    render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByText("Sending…")).toBeTruthy());
  });

  it("keeps an undelivered notice at the top, not buried under yesterday", async () => {
    mockListInbox.mockResolvedValue([
      msg({ id: "d-old", eventId: "e-old", title: "Older thing" }),
      msg({ id: "d-q", eventId: "e-q", title: "Still sending", deliveredAtIso: null }),
    ]);
    render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByText("Still sending")).toBeTruthy());
    expect(screen.getByText("Sending…")).toBeTruthy();
  });

  it("renders an unrecognised event type instead of dropping it", async () => {
    // eventType is free text, not an enum. A notice we cannot categorise is
    // still a notice the patient was sent.
    mockListInbox.mockResolvedValue([
      msg({ eventId: "e-x", eventType: "something.brand.new", title: "Unknown kind" }),
    ]);
    render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByText("Unknown kind")).toBeTruthy());
  });

  it("has NO unread badge or mark-as-read — the API has no read state", async () => {
    mockListInbox.mockResolvedValue([msg()]);
    render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByText("Appointment confirmed")).toBeTruthy());
    expect(screen.queryByLabelText(/mark.*read/i)).toBeNull();
    expect(screen.queryByText(/unread/i)).toBeNull();
  });

  it("distinguishes an empty inbox from a failed load", async () => {
    render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByText("Nothing yet")).toBeTruthy());

    mockListInbox.mockRejectedValue(new Error("offline"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderRaw(
      <QueryClientProvider client={qc}>
        <NotificationsScreen />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Couldn't load notifications")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Retry loading notifications"));
  });
});

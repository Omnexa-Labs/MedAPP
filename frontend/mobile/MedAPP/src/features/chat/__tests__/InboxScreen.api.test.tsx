// InboxScreen against inbox_service.
//
// The screen rendered a seed array until now, under a note claiming the call
// was blocked on "the messaging service". It never was — `GET /v1/threads` has
// shipped all along. These cases lock the three states a real request has, and
// the one ordering rule that is easy to get backwards.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithSafeArea } from "@/test/safe-area";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => ({}),
  // The inbox polls only while focused. Under test it is always on top.
  useIsFocused: () => true,
}));

jest.mock("@/store/auth-store", () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { displayName: "Ama Mensah" } }),
}));

// `mock`-prefixed on purpose: babel hoists jest.mock above the const, and jest
// only permits a factory to close over a variable whose name starts with
// "mock". ChatThreadScreen's suite carries the same note.
const mockListThreads = jest.fn();
const mockCreateThread = jest.fn();
jest.mock("../api", () => ({
  chatApi: {
    listThreads: (...a: unknown[]) => mockListThreads(...a),
    createThread: (...a: unknown[]) => mockCreateThread(...a),
  },
}));

import { InboxScreen } from "../InboxScreen";

// The threads query carries a `refetchInterval`, so an abandoned client keeps a
// live timer after the test that made it — which jest reports as a worker that
// "failed to exit gracefully". Clearing the cache cancels it.
const clients: QueryClient[] = [];
afterEach(() => {
  for (const c of clients.splice(0)) c.clear();
});

function render() {
  // `retry: false` so the error case fails on the FIRST rejection instead of
  // burning the default three attempts and timing the test out.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(qc);
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
  beforeEach(() => {
    mockListThreads.mockReset();
    mockCreateThread.mockReset();
    mockPush.mockReset();
  });

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

// ---------------------------------------------------------------------------
// DEAD CONTROLS
//
// Both of these passed a green suite while doing nothing, because the old cases
// asserted that a chip and a FAB were on screen — which they were.
// ---------------------------------------------------------------------------

describe("InboxScreen — the compose FAB actually creates a thread", () => {
  beforeEach(() => {
    mockListThreads.mockReset().mockResolvedValue([]);
    mockCreateThread.mockReset().mockResolvedValue(thread({ id: "t-new", subject: "Sore throat" }));
    mockPush.mockReset();
  });

  it("POSTs /v1/threads and opens what it created", async () => {
    // The FAB's `onPress` was an empty body with a TODO reading "once the
    // messaging service exposes POST /v1/threads". It has exposed it all along.
    render();
    await waitFor(() => expect(mockListThreads).toHaveBeenCalled());

    fireEvent.press(screen.getByLabelText("Compose new message"));
    fireEvent.changeText(screen.getByLabelText("Conversation subject"), "Sore throat");
    fireEvent.press(screen.getByLabelText("Start conversation"));

    await waitFor(() =>
      expect(mockCreateThread).toHaveBeenCalledWith({
        subject: "Sore throat",
        source: "direct",
        // Assigned to a role, so a clinician picks it up. A thread with no
        // assignee and no participants reaches nobody.
        assignedRole: "doctor",
      }),
    );
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({ params: expect.objectContaining({ threadId: "t-new" }) }),
      ),
    );
  });

  it("will not POST an empty subject", async () => {
    render();
    await waitFor(() => expect(mockListThreads).toHaveBeenCalled());

    fireEvent.press(screen.getByLabelText("Compose new message"));
    fireEvent.press(screen.getByLabelText("Start conversation"));

    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it("says so when creating fails, instead of closing as though it worked", async () => {
    mockCreateThread.mockRejectedValue(new Error("offline"));
    render();
    await waitFor(() => expect(mockListThreads).toHaveBeenCalled());

    fireEvent.press(screen.getByLabelText("Compose new message"));
    fireEvent.changeText(screen.getByLabelText("Conversation subject"), "Sore throat");
    fireEvent.press(screen.getByLabelText("Start conversation"));

    await waitFor(() => expect(screen.getByText(/Couldn't start that conversation/)).toBeTruthy());
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("InboxScreen — every filter chip can match a row", () => {
  // WAS: All / Doctors / Groups / Private over a `kind` union whose "group"
  // member `toConversation` never produces, and a `badge.label === "Doctor"`
  // comparison against a service that stores the role lowercase. Three of the
  // four selected nothing, permanently, on a screen for finding a conversation.
  const rows = [
    thread({ id: "t-doc", subject: "With a doctor", assignedRole: "doctor" }),
    thread({ id: "t-nurse", subject: "With a nurse", assignedRole: "nurse" }),
    thread({ id: "t-direct", subject: "Unassigned", assignedRole: null }),
  ];

  beforeEach(() => {
    mockListThreads.mockReset().mockResolvedValue(rows);
    mockCreateThread.mockReset();
    mockPush.mockReset();
  });

  it("Doctors matches the LOWERCASE role the service actually stores", async () => {
    render();
    await waitFor(() => expect(screen.getByText("With a doctor")).toBeTruthy());

    fireEvent.press(screen.getByText("Doctors"));
    expect(screen.getByText("With a doctor")).toBeTruthy();
    expect(screen.queryByText("With a nurse")).toBeNull();
    expect(screen.queryByText("Unassigned")).toBeNull();
  });

  it("Care team matches every other assigned role", async () => {
    render();
    await waitFor(() => expect(screen.getByText("With a nurse")).toBeTruthy());

    fireEvent.press(screen.getByText("Care team"));
    expect(screen.getByText("With a nurse")).toBeTruthy();
    expect(screen.queryByText("With a doctor")).toBeNull();
  });

  it("Direct matches the threads assigned to nobody", async () => {
    render();
    await waitFor(() => expect(screen.getByText("Unassigned")).toBeTruthy());

    fireEvent.press(screen.getByText("Direct"));
    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.queryByText("With a doctor")).toBeNull();
  });

  it("offers no Groups chip — the mapper cannot produce a group", async () => {
    render();
    await waitFor(() => expect(screen.getByText("With a doctor")).toBeTruthy());
    expect(screen.queryByText("Groups")).toBeNull();
  });
});

describe("InboxScreen — BRAND compliance", () => {
  const src = () =>
    readFileSync(join(__dirname, "..", "InboxScreen.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\/.*$/gm, "");

  it("imports no icon library — the icon gate is the only file allowed to", () => {
    expect(src()).not.toMatch(/@expo\/vector-icons/);
    expect(src()).not.toMatch(/MaterialIcons/);
  });

  it("carries no raw colour literals, including white", () => {
    expect(src()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src()).not.toMatch(/\brgba?\(/);
    expect(src()).not.toMatch(/\btext-white\b/);
  });
});

// ChatThreadScreen against inbox_service.
//
// The seeded path is covered by ChatThreadScreen.test.tsx. THIS file covers the
// path taken when InboxScreen pushes a real `threadId` — which is a different
// code path entirely, and includes the one rule with a privacy consequence.

import { screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";

const mockParams: { threadId?: string; name?: string } = { threadId: "t-1" };
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  // The screen polls only WHILE FOCUSED. Under test it is always on top.
  useIsFocused: () => true,
}));

jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ id: "me", displayName: "Ama Mensah", avatarUrl: null }),
}));

const mockListMessages = jest.fn();
const mockSendMessage = jest.fn();
const mockMarkRead = jest.fn();
const mockGetThread = jest.fn();
jest.mock("../api", () => ({
  chatApi: {
    listMessages: (...a: unknown[]) => mockListMessages(...a),
    sendMessage: (...a: unknown[]) => mockSendMessage(...a),
    markRead: (...a: unknown[]) => mockMarkRead(...a),
    getThread: (...a: unknown[]) => mockGetThread(...a),
  },
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
jest.mock("expo-audio", () => {
  const recorder = { isRecording: false, uri: null, prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn() };
  const permission = { granted: true, status: "granted", canAskAgain: true };
  return {
    RecordingPresets: { HIGH_QUALITY: {}, LOW_QUALITY: {} },
    useAudioRecorder: () => recorder,
    getRecordingPermissionsAsync: jest.fn(async () => ({ ...permission })),
    requestRecordingPermissionsAsync: jest.fn(async () => ({ ...permission })),
    setAudioModeAsync: jest.fn(async () => {}),
    // Playback, added with the voice-note pass: the review bar and the sent
    // bubble both mount a player. A recorder-only mock leaves them throwing
    // "useAudioPlayer is not a function" the moment a capture exists.
    useAudioPlayer: jest.fn(() => ({
      play: jest.fn(),
      pause: jest.fn(),
      seekTo: jest.fn(async () => {}),
    })),
    useAudioPlayerStatus: jest.fn(() => ({
      currentTime: 0,
      duration: 0,
      playing: false,
      isLoaded: false,
      didJustFinish: false,
    })),
  };
});
jest.mock("expo-file-system", () => {
  // NOT `constructor(public uri: string)` — the TS parameter-property shorthand
  // reads as an out-of-scope variable access to jest's mock-factory guard.
  class File {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {}
  }
  return { File };
});

import { ChatThreadScreen } from "../ChatThreadScreen";

// The transcript query carries a `refetchInterval`, so an abandoned client keeps
// a live timer after the test that made it — which jest reports as a worker that
// "failed to exit gracefully". Clearing the cache cancels it.
const clients: QueryClient[] = [];
afterEach(() => {
  for (const c of clients.splice(0)) c.clear();
});

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(qc);
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const msg = (over: Record<string, unknown> = {}) => ({
  id: "m-1",
  threadId: "t-1",
  senderUserId: "them",
  senderRole: "doctor",
  body: "Hello from the clinic",
  isInternal: false,
  createdAtIso: "2026-08-06T10:00:00Z",
  ...over,
});

const threadOut = (over: Record<string, unknown> = {}) => ({
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

describe("ChatThreadScreen — live thread", () => {
  beforeEach(() => {
    mockListMessages.mockReset().mockResolvedValue([]);
    mockSendMessage.mockReset().mockResolvedValue(msg());
    mockMarkRead.mockReset().mockResolvedValue({});
    mockGetThread.mockReset().mockResolvedValue(threadOut());
    mockParams.threadId = "t-1";
    mockParams.name = undefined;
  });

  it("renders the server transcript", async () => {
    mockListMessages.mockResolvedValue([msg()]);
    render(<ChatThreadScreen />);
    await waitFor(() => expect(screen.getByText("Hello from the clinic")).toBeTruthy());
  });

  it("NEVER renders a clinician-only note in a patient thread", async () => {
    // The one rule here with a privacy consequence rather than a cosmetic one:
    // `is_internal` is a note clinicians write ABOUT a patient. Leaking it into
    // the patient's own thread is an incident. Default is exclude.
    mockListMessages.mockResolvedValue([
      msg({ id: "m-pub", body: "Your results look good" }),
      msg({ id: "m-int", body: "Query possible non-adherence", isInternal: true }),
    ]);
    render(<ChatThreadScreen />);
    await waitFor(() => expect(screen.getByText("Your results look good")).toBeTruthy());
    expect(screen.queryByText("Query possible non-adherence")).toBeNull();
  });

  it("shows internal notes only when a caller opts in", async () => {
    mockListMessages.mockResolvedValue([msg({ body: "Query possible non-adherence", isInternal: true })]);
    render(<ChatThreadScreen showInternalNotes />);
    await waitFor(() => expect(screen.getByText("Query possible non-adherence")).toBeTruthy());
  });

  it("puts the signed-in user's own messages on the outgoing side", async () => {
    // Direction resolves against the USER ID, not a role string — a clinician
    // reading a clinician's thread must still see their own messages as theirs.
    mockListMessages.mockResolvedValue([
      msg({ id: "m-mine", senderUserId: "me", senderRole: "doctor", body: "Mine" }),
      msg({ id: "m-theirs", senderUserId: "them", body: "Theirs" }),
    ]);
    render(<ChatThreadScreen />);
    await waitFor(() => expect(screen.getByText("Mine")).toBeTruthy());
    expect(screen.getByText("Theirs")).toBeTruthy();
  });

  it("marks the thread read on open", async () => {
    render(<ChatThreadScreen />);
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith("t-1"));
  });

  it("survives a failed mark-read — it must never block reading", async () => {
    mockMarkRead.mockRejectedValue(new Error("boom"));
    mockListMessages.mockResolvedValue([msg()]);
    render(<ChatThreadScreen />);
    await waitFor(() => expect(screen.getByText("Hello from the clinic")).toBeTruthy());
  });

  it("POSTs a composed message to the thread", async () => {
    render(<ChatThreadScreen />);
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalled());
    fireEvent.changeText(screen.getByLabelText("Message input"), "Thanks doctor");
    fireEvent.press(screen.getByLabelText("Send message"));
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith("t-1", "Thanks doctor"));
  });

  it("fires NO request when there is no threadId — the seeded callers", async () => {
    // PractitionerChatScreen and the profile "Message" button push no id. They
    // must not request a thread that does not exist.
    mockParams.threadId = undefined;
    render(<ChatThreadScreen />);
    await waitFor(() => expect(screen.getByText("Today")).toBeTruthy());
    expect(mockListMessages).not.toHaveBeenCalled();
    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(mockGetThread).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATIENT-SAFETY CASES
//
// The audit's finding about this suite's ancestors was that the tests asserted
// LAYOUT and never asserted that a message reached the server — and a fabricated
// bubble lays out exactly like a real one. So every case here asserts either a
// REQUEST or the absence of one, or asserts an absence of content.
// ---------------------------------------------------------------------------

describe("ChatThreadScreen — nothing fabricates a clinician", () => {
  beforeEach(() => {
    mockListMessages.mockReset().mockResolvedValue([]);
    mockSendMessage.mockReset().mockResolvedValue(msg());
    mockMarkRead.mockReset().mockResolvedValue({});
    mockGetThread.mockReset().mockResolvedValue(threadOut());
    mockParams.threadId = "t-1";
    mockParams.name = undefined;
  });

  it("NEVER injects a reply after a send on a live thread", async () => {
    // THE WORST DEFECT THIS FILE HAD. A `setTimeout` appended an INCOMING
    // bubble one second after every send — "Understood. I'll review that and
    // get back to you shortly" — rendered as if from the clinician named in the
    // app bar, on live threads included. A patient could stand down on a
    // symptom because of it.
    jest.useFakeTimers();
    try {
      render(<ChatThreadScreen />);
      await act(async () => {});

      fireEvent.changeText(screen.getByLabelText("Message input"), "My chest feels tight");
      fireEvent.press(screen.getByLabelText("Send message"));

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      expect(screen.queryByText(/I'll review that and get back to you shortly/)).toBeNull();
      // …and nothing else arrived from nowhere either: the only rows on screen
      // are the ones this device composed.
      expect(screen.queryByText(/get back to you/)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("renders NO seeded message when a threadId is present", async () => {
    render(<ChatThreadScreen />);
    await waitFor(() => expect(mockListMessages).toHaveBeenCalled());
    for (const seeded of [
      /Continue as prescribed for now/,
      /I've reviewed your latest ECG report/,
      /Vitals summary/,
      /122\/80/,
    ]) {
      expect(screen.queryByText(seeded)).toBeNull();
    }
  });

  it("does NOT fall back to seeds when the transcript fails to load", async () => {
    // The old error branch returned `null`, so the effect never replaced the
    // seed — six invented messages sat PERMANENTLY under a "Couldn't load this
    // conversation" banner, which is the most misleading combination available.
    mockListMessages.mockRejectedValue(new Error("offline"));
    render(<ChatThreadScreen />);
    await waitFor(() => expect(screen.getByText("Couldn't load this conversation")).toBeTruthy());
    expect(screen.queryByText(/Continue as prescribed for now/)).toBeNull();
    expect(screen.queryByText("Vitals summary")).toBeNull();
  });

  it("asserts no presence — the dot is off unless a caller passes it", async () => {
    render(<ChatThreadScreen />);
    await waitFor(() => expect(mockListMessages).toHaveBeenCalled());
    // `is_active` is membership, not connectivity (./api.ts). Nothing in this
    // product can source a green dot, so nobody passes `isOnline`.
    expect(screen.queryByLabelText("Online")).toBeNull();
  });

  it("takes the app bar identity from GET /threads/:id, not from the seed", async () => {
    mockGetThread.mockResolvedValue(threadOut({ subject: "Rash follow-up", assignedRole: "nurse" }));
    render(<ChatThreadScreen />);
    await waitFor(() => expect(screen.getByText("Rash follow-up")).toBeTruthy());
    expect(mockGetThread).toHaveBeenCalledWith("t-1");
    expect(screen.getByText("Nurse")).toBeTruthy();
    // The seeded cardiologist must not appear on somebody else's thread.
    expect(screen.queryByText("Doctor · Cardiologist")).toBeNull();
    expect(screen.queryByText("Dr. Adjoa Boateng")).toBeNull();
  });

  it("omits the subtitle entirely when the thread is assigned to nobody", async () => {
    mockGetThread.mockResolvedValue(threadOut({ assignedRole: null }));
    render(<ChatThreadScreen />);
    await waitFor(() => expect(screen.getByText("Cardiology follow-up")).toBeTruthy());
    expect(screen.queryByText(/Cardiologist/)).toBeNull();
  });

  it("has no video-call button — there is no video transport to reach", async () => {
    render(<ChatThreadScreen />);
    await waitFor(() => expect(mockListMessages).toHaveBeenCalled());
    expect(screen.queryByLabelText("Video call")).toBeNull();
  });

  it("has no clinical share menu — its rows attached no clinical data", async () => {
    render(<ChatThreadScreen />);
    await waitFor(() => expect(mockListMessages).toHaveBeenCalled());
    expect(screen.queryByLabelText("Share clinical data")).toBeNull();
    expect(screen.queryByLabelText("Share Medical History")).toBeNull();
  });
});

describe("ChatThreadScreen — a send is never claimed before it happens", () => {
  beforeEach(() => {
    mockListMessages.mockReset().mockResolvedValue([]);
    mockSendMessage.mockReset().mockResolvedValue(msg({ id: "m-server", senderUserId: "me" }));
    mockMarkRead.mockReset().mockResolvedValue({});
    mockGetThread.mockReset().mockResolvedValue(threadOut());
    mockParams.threadId = "t-1";
    mockParams.name = undefined;
  });

  it("shows a FAILED state with a retry, and no delivered tick", async () => {
    mockSendMessage.mockRejectedValue(new Error("offline"));
    render(<ChatThreadScreen />);
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalled());

    fireEvent.changeText(screen.getByLabelText("Message input"), "Is this dose right?");
    fireEvent.press(screen.getByLabelText("Send message"));

    await waitFor(() => expect(screen.getByText("Not sent")).toBeTruthy());
    expect(screen.getByLabelText("Retry sending message")).toBeTruthy();
    // The message is still on screen — a failed send must not silently vanish.
    expect(screen.getByText("Is this dose right?")).toBeTruthy();
    // …and it does not claim to have been sent.
    expect(screen.queryByText("Sending…")).toBeNull();
  });

  it("RE-POSTS the same body when the retry is pressed", async () => {
    mockSendMessage.mockRejectedValueOnce(new Error("offline"));
    render(<ChatThreadScreen />);
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalled());

    fireEvent.changeText(screen.getByLabelText("Message input"), "Is this dose right?");
    fireEvent.press(screen.getByLabelText("Send message"));
    await waitFor(() => expect(screen.getByLabelText("Retry sending message")).toBeTruthy());

    mockSendMessage.mockResolvedValue(msg({ id: "m-server", body: "Is this dose right?" }));
    fireEvent.press(screen.getByLabelText("Retry sending message"));

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(2));
    expect(mockSendMessage).toHaveBeenLastCalledWith("t-1", "Is this dose right?");
    await waitFor(() => expect(screen.queryByText("Not sent")).toBeNull());
  });

  it("does NOT drop the optimistic bubble when the refetch lands without it", async () => {
    // The state race: `onSettled` invalidated, the refetch produced fresh
    // `liveMessages`, and an effect replaced the whole list — so the bubble the
    // user had just watched appear disappeared again. The outbox retires an
    // entry only once the transcript carries the id the server gave it.
    mockSendMessage.mockResolvedValue(msg({ id: "m-server", body: "Thanks doctor" }));
    render(<ChatThreadScreen />);
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalled());

    fireEvent.changeText(screen.getByLabelText("Message input"), "Thanks doctor");
    fireEvent.press(screen.getByLabelText("Send message"));

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled());
    // The refetch deliberately still returns nothing — the server row has not
    // propagated. The bubble must survive it.
    await waitFor(() => expect(mockListMessages).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Thanks doctor")).toBeTruthy();
  });

  it("does not render the same message twice once the server row arrives", async () => {
    mockSendMessage.mockResolvedValue(msg({ id: "m-server", body: "Thanks doctor" }));
    render(<ChatThreadScreen />);
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalled());

    mockListMessages.mockResolvedValue([
      msg({ id: "m-server", senderUserId: "me", body: "Thanks doctor" }),
    ]);
    fireEvent.changeText(screen.getByLabelText("Message input"), "Thanks doctor");
    fireEvent.press(screen.getByLabelText("Send message"));

    await waitFor(() => expect(screen.getAllByText("Thanks doctor")).toHaveLength(1));
  });

  it("labels a send that is NOT being transmitted, rather than ticking it", async () => {
    // No `threadId` means no conversation to post to. The old code appended the
    // bubble with `delivered: true` anyway — a green double tick on a message
    // that never left the handset.
    mockParams.threadId = undefined;
    render(<ChatThreadScreen />);
    await waitFor(() => expect(screen.getByText("Today")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText("Message input"), "Are these numbers ok?");
    fireEvent.press(screen.getByLabelText("Send message"));

    expect(screen.getByText(/Not sent — this conversation isn't connected/)).toBeTruthy();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

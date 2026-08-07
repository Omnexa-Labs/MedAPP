// ChatThreadScreen against inbox_service.
//
// The seeded path is covered by ChatThreadScreen.test.tsx. THIS file covers the
// path taken when InboxScreen pushes a real `threadId` — which is a different
// code path entirely, and includes the one rule with a privacy consequence.

import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";

const mockParams: { threadId?: string; name?: string } = { threadId: "t-1" };
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ id: "me", displayName: "Ama Mensah", avatarUrl: null }),
}));

const mockListMessages = jest.fn();
const mockSendMessage = jest.fn();
const mockMarkRead = jest.fn();
jest.mock("../api", () => ({
  chatApi: {
    listMessages: (...a: unknown[]) => mockListMessages(...a),
    sendMessage: (...a: unknown[]) => mockSendMessage(...a),
    markRead: (...a: unknown[]) => mockMarkRead(...a),
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

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe("ChatThreadScreen — live thread", () => {
  beforeEach(() => {
    mockListMessages.mockReset().mockResolvedValue([]);
    mockSendMessage.mockReset().mockResolvedValue(msg());
    mockMarkRead.mockReset().mockResolvedValue({});
    mockParams.threadId = "t-1";
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
  });
});

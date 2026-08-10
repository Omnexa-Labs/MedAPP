// Voice notes, through the screen.
//
// Every case asserts a REQUEST, the absence of one, or the absence of a CLAIM —
// the discipline ChatThreadScreen.api.test.tsx's header sets out, and the reason
// it exists: a fabricated bubble lays out exactly like a real one, and a voice
// note that renders a tick it has not earned is the same defect with audio in it.

import { screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";

const mockParams: { threadId?: string } = { threadId: "t-1" };
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
}));

jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ id: "me", displayName: "Ama Mensah", avatarUrl: null }),
}));

const mockListMessages = jest.fn();
const mockSendMessage = jest.fn();
const mockMarkRead = jest.fn();
const mockGetThread = jest.fn();
const mockUploadAttachment = jest.fn();
jest.mock("../api", () => {
  // The limits are the REAL ones — a mocked cap would test the mock. Only the
  // network functions are replaced.
  const limits = jest.requireActual("../attachmentLimits");
  return {
    chatApi: {
      listMessages: (...a: unknown[]) => mockListMessages(...a),
      sendMessage: (...a: unknown[]) => mockSendMessage(...a),
      markRead: (...a: unknown[]) => mockMarkRead(...a),
      getThread: (...a: unknown[]) => mockGetThread(...a),
      uploadAttachment: (...a: unknown[]) => mockUploadAttachment(...a),
    },
    attachmentContentUri: (t: string, a: string) =>
      `https://api.test/v1/threads/${t}/attachments/${a}/content`,
    attachmentAuthHeaders: async () => ({ Authorization: "Bearer tok-1" }),
    ...limits,
  };
});

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => mockPickResult),
}));
let mockPickResult: unknown = { canceled: true, assets: null };

// ---------------------------------------------------------------------------
// expo-audio: a recorder that produces a uri, and a player that reports status.
// The `permission` object is reassigned per test to drive the denial paths.
// ---------------------------------------------------------------------------
let mockPermission = { granted: true, status: "granted", canAskAgain: true };
const mockRecorder = { isRecording: false, uri: null as string | null, prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn() };
jest.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: {}, LOW_QUALITY: {} },
  useAudioRecorder: () => mockRecorder,
  getRecordingPermissionsAsync: jest.fn(async () => ({ ...mockPermission })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ ...mockPermission })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => {}) })),
  useAudioPlayerStatus: jest.fn(() => ({
    currentTime: 0,
    duration: 0,
    playing: false,
    isLoaded: false,
    didJustFinish: false,
  })),
}));

// The capture's size, so the 8 MiB cap can be driven. `null` means "unreadable",
// which the hook treats as fine rather than as too big.
let mockFileSize: number | null = 928;
jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return true;
    }
    get size() {
      return mockFileSize;
    }
    delete() {}
  }
  return { File };
});

import { ChatThreadScreen } from "../ChatThreadScreen";

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
  senderUserId: "me",
  senderRole: "user",
  body: "",
  isInternal: false,
  createdAtIso: "2026-08-08T10:00:00Z",
  attachments: [],
  ...over,
});

const staged = (over: Record<string, unknown> = {}) => ({
  id: "a-1",
  threadId: "t-1",
  messageId: null,
  uploaderUserId: "me",
  contentType: "audio/m4a",
  byteSize: 928,
  originalFilename: "voice-note.m4a",
  durationMs: 7400,
  createdAtIso: "2026-08-08T10:20:20Z",
  ...over,
});

beforeEach(() => {
  mockListMessages.mockReset().mockResolvedValue([]);
  mockSendMessage.mockReset().mockResolvedValue(msg());
  mockMarkRead.mockReset().mockResolvedValue({});
  mockGetThread.mockReset().mockResolvedValue({
    id: "t-1", subject: "Cardiology follow-up", source: "direct", status: "open",
    createdByUserId: "u-1", assignedRole: null, assignedUserId: null, bookingId: null,
    lastMessageAtIso: "2026-08-08T10:00:00Z",
  });
  mockUploadAttachment.mockReset().mockResolvedValue(staged());
  mockParams.threadId = "t-1";
  mockPermission = { granted: true, status: "granted", canAskAgain: true };
  mockRecorder.isRecording = false;
  mockRecorder.uri = "file:///tmp/rec.m4a";
  mockRecorder.prepareToRecordAsync.mockReset().mockResolvedValue(undefined);
  mockRecorder.record.mockReset();
  mockRecorder.stop.mockReset().mockResolvedValue(undefined);
  mockFileSize = 928;
  mockPickResult = { canceled: true, assets: null };
});

/** Tap the mic. Assistive technology delivers exactly this and no hold. */
async function tapMic() {
  await act(async () => {
    fireEvent.press(screen.getByTestId("voice-mic-button"));
  });
}

async function openThread() {
  render(<ChatThreadScreen />);
  await waitFor(() => expect(mockMarkRead).toHaveBeenCalled());
}

// ---------------------------------------------------------------------------
// THE ACCESSIBLE PATH — tap to start, tap to stop
//
// Hold-to-record is inoperable under Switch Control and under a screen reader,
// which consume the touch and deliver an activation. These cases exercise ONLY
// activations, so they prove the feature is reachable without a gesture.
// ---------------------------------------------------------------------------
describe("ChatThreadScreen — a voice note can be recorded and sent WITHOUT a hold", () => {
  it("records on a tap and stops on the next tap, with no gesture at all", async () => {
    await openThread();
    await tapMic();
    // Recording: the mic now says what the next activation does.
    expect(screen.getByLabelText("Stop recording")).toBeTruthy();
    expect(screen.getByTestId("voice-recording-bar")).toBeTruthy();

    await tapMic();
    expect(mockRecorder.stop).toHaveBeenCalled();
    // …and lands in review, with a labelled player and a labelled discard.
    await waitFor(() => expect(screen.getByTestId("voice-review-bar")).toBeTruthy());
    expect(screen.getByLabelText("Play voice note")).toBeTruthy();
    expect(screen.getByLabelText("Discard recording")).toBeTruthy();
  });

  it("uploads then sends, with duration_ms and an EMPTY body", async () => {
    await openThread();
    await tapMic();
    await tapMic();
    await waitFor(() => expect(screen.getByTestId("voice-review-bar")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Send message"));
    });

    await waitFor(() => expect(mockUploadAttachment).toHaveBeenCalled());
    const [threadId, file] = mockUploadAttachment.mock.calls[0];
    expect(threadId).toBe("t-1");
    expect(file.uri).toBe("file:///tmp/rec.m4a");
    expect(file.mimeType).toBe("audio/m4a");
    expect(typeof file.durationMs).toBe("number");

    // The send carries the STAGED id and no typed text.
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith("t-1", "", ["a-1"]));
  });

  it("labels the mic so a screen reader is told what the next activation does", async () => {
    await openThread();
    expect(screen.getByLabelText("Voice message")).toBeTruthy();
    await tapMic();
    expect(screen.queryByLabelText("Voice message")).toBeNull();
    expect(screen.getByLabelText("Stop recording")).toBeTruthy();
  });

  it("offers Cancel while recording hands-free, and discards without sending", async () => {
    await openThread();
    await tapMic();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Discard recording"));
    });
    await waitFor(() => expect(screen.queryByTestId("voice-recording-bar")).toBeNull());
    expect(screen.queryByTestId("voice-review-bar")).toBeNull();
    expect(mockUploadAttachment).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// HOLD-TO-RECORD — the same state machine, driven by the gesture
// ---------------------------------------------------------------------------
describe("ChatThreadScreen — hold to record", () => {
  const press = (x = 300, y = 700) =>
    fireEvent(screen.getByTestId("voice-mic-button"), "pressIn", {
      nativeEvent: { pageX: x, pageY: y },
    });
  const move = (x: number, y: number) =>
    fireEvent(screen.getByTestId("voice-mic-button"), "touchMove", {
      nativeEvent: { pageX: x, pageY: y },
    });
  const release = () => fireEvent(screen.getByTestId("voice-mic-button"), "pressOut");

  it("commits on release", async () => {
    await openThread();
    await act(async () => {
      press();
    });
    expect(screen.getByTestId("voice-recording-bar")).toBeTruthy();
    await act(async () => {
      release();
    });
    await waitFor(() => expect(screen.getByTestId("voice-review-bar")).toBeTruthy());
  });

  it("arms cancel on a slide left, and a release then sends NOTHING", async () => {
    await openThread();
    await act(async () => {
      press(300, 700);
    });
    await act(async () => {
      move(200, 700); // -100dp, past the 64 threshold
    });
    expect(screen.getByTestId("voice-recording-bar-cancel")).toBeTruthy();
    await act(async () => {
      release();
    });
    await waitFor(() => expect(screen.queryByTestId("voice-recording-bar-cancel")).toBeNull());
    expect(screen.queryByTestId("voice-review-bar")).toBeNull();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("locks on a slide up, and then IGNORES the release", async () => {
    await openThread();
    await act(async () => {
      press(300, 700);
    });
    await act(async () => {
      move(300, 620); // -80dp, past the 56 threshold
    });
    await act(async () => {
      release();
    });
    // Still recording, hands free — and the hands-free Cancel is now offered.
    expect(screen.getByTestId("voice-recording-bar")).toBeTruthy();
    expect(screen.getByLabelText("Discard recording")).toBeTruthy();
    expect(screen.queryByTestId("voice-review-bar")).toBeNull();
  });

  it("prefers locking over cancelling when a diagonal crosses both", async () => {
    // Locking is recoverable; cancelling destroys the recording.
    await openThread();
    await act(async () => {
      press(300, 700);
    });
    await act(async () => {
      move(200, 620);
    });
    expect(screen.queryByTestId("voice-recording-bar-cancel")).toBeNull();
    expect(screen.getByTestId("voice-recording-bar")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// THE LIMITS, refused HERE rather than by a 413 the user cannot read
// ---------------------------------------------------------------------------
describe("ChatThreadScreen — the limits are enforced before the request", () => {
  it("refuses an over-size capture in words, and uploads nothing", async () => {
    mockFileSize = 9 * 1024 * 1024;
    await openThread();
    await tapMic();
    await tapMic();

    await waitFor(() =>
      expect(screen.getByText(/larger than 8 MB/)).toBeTruthy(),
    );
    expect(screen.queryByTestId("voice-review-bar")).toBeNull();
    expect(mockUploadAttachment).not.toHaveBeenCalled();
  });

  it("stops itself at the duration cap and KEEPS the recording", async () => {
    // Four hours is a 422 on `duration_ms`. Discovering that after four hours of
    // recording is not a thing to do to someone — and neither is discarding the
    // audio, which is exactly at the limit and therefore valid.
    //
    // The CLOCK is moved rather than the timers: advancing four hours of a
    // one-second interval fires 14,400 callbacks and re-renders the screen once
    // per callback, which takes minutes. Jumping `Date.now` and firing ONE tick
    // exercises the same branch — the tick compares `Date.now()` to the start.
    jest.useFakeTimers();
    const start = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(start);
    try {
      render(<ChatThreadScreen />);
      await act(async () => {});
      await act(async () => {
        fireEvent.press(screen.getByTestId("voice-mic-button"));
      });

      now.mockReturnValue(start + 4 * 60 * 60 * 1000 + 1);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      await act(async () => {});

      expect(screen.getByText(/Recording stopped at four hours/)).toBeTruthy();
      expect(screen.getByTestId("voice-review-bar")).toBeTruthy();
    } finally {
      now.mockRestore();
      jest.useRealTimers();
    }
  });

  it("refuses an over-size PICKED file without disturbing the slot", async () => {
    mockPickResult = {
      canceled: false,
      assets: [{ name: "scan.pdf", uri: "file:///tmp/scan.pdf", mimeType: "application/pdf", size: 9 * 1024 * 1024 }],
    };
    await openThread();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Attach file"));
    });
    await waitFor(() => expect(screen.getByText(/larger than 8 MB/)).toBeTruthy());
    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
  });

  it("refuses a type the server's allowlist does not carry", async () => {
    mockPickResult = {
      canceled: false,
      assets: [{ name: "referral.docx", uri: "file:///tmp/referral.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 20000 }],
    };
    await openThread();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Attach file"));
    });
    await waitFor(() =>
      expect(screen.getByText(/can carry audio, photos and PDFs/)).toBeTruthy(),
    );
    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// NOTHING IS CLAIMED SENT BEFORE THE SERVER SAYS SO
// ---------------------------------------------------------------------------
describe("ChatThreadScreen — a voice note is never ticked before it lands", () => {
  async function recordAndSend() {
    await openThread();
    await tapMic();
    await tapMic();
    await waitFor(() => expect(screen.getByTestId("voice-review-bar")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Send message"));
    });
  }

  it("shows a FAILED state with a retry when the UPLOAD fails, and no tick", async () => {
    mockUploadAttachment.mockRejectedValue(new Error("413"));
    await recordAndSend();

    await waitFor(() => expect(screen.getByText("Not sent")).toBeTruthy());
    expect(screen.getByLabelText("Retry sending message")).toBeTruthy();
    expect(mockSendMessage).not.toHaveBeenCalled();
    // The bubble is still there, and it still claims nothing.
    expect(screen.queryByText("Sending…")).toBeNull();
  });

  it("shows a FAILED state with a retry when the SEND fails after a good upload", async () => {
    mockSendMessage.mockRejectedValue(new Error("offline"));
    await recordAndSend();
    await waitFor(() => expect(screen.getByText("Not sent")).toBeTruthy());
    expect(screen.getByLabelText("Retry sending message")).toBeTruthy();
  });

  it("keeps the failed voice note PLAYABLE from the local file", async () => {
    // The recording is the thing the user would lose. It stays on the device and
    // stays playable, which is what makes the failure recoverable.
    mockUploadAttachment.mockRejectedValue(new Error("413"));
    await recordAndSend();
    await waitFor(() => expect(screen.getByText("Not sent")).toBeTruthy());
    expect(screen.getByLabelText("Play voice note")).toBeTruthy();
  });

  it("RE-UPLOADS the same recording on retry after an upload failure", async () => {
    mockUploadAttachment.mockRejectedValueOnce(new Error("network"));
    await recordAndSend();
    await waitFor(() => expect(screen.getByLabelText("Retry sending message")).toBeTruthy());

    mockUploadAttachment.mockResolvedValue(staged());
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Retry sending message"));
    });

    await waitFor(() => expect(mockUploadAttachment).toHaveBeenCalledTimes(2));
    // The SAME file, not a re-recording.
    expect(mockUploadAttachment.mock.calls[1][1].uri).toBe("file:///tmp/rec.m4a");
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith("t-1", "", ["a-1"]));
  });

  it("does NOT stage a second copy when only the SEND had failed", async () => {
    // A second staged attachment would be an orphan row and an orphan file, and
    // nothing in the product reaps those.
    mockSendMessage.mockRejectedValueOnce(new Error("offline"));
    await recordAndSend();
    await waitFor(() => expect(screen.getByLabelText("Retry sending message")).toBeTruthy());
    expect(mockUploadAttachment).toHaveBeenCalledTimes(1);

    mockSendMessage.mockResolvedValue(msg({ id: "m-server" }));
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Retry sending message"));
    });

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(2));
    expect(mockUploadAttachment).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenLastCalledWith("t-1", "", ["a-1"]);
  });

  it("posts NOTHING when there is no thread behind the route", async () => {
    mockParams.threadId = undefined;
    render(<ChatThreadScreen />);
    await waitFor(() => expect(screen.getByText("Today")).toBeTruthy());
    await tapMic();
    await tapMic();
    await waitFor(() => expect(screen.getByTestId("voice-review-bar")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Send message"));
    });
    expect(mockUploadAttachment).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(screen.getByText(/Not sent — this conversation isn't connected/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PERMISSION
// ---------------------------------------------------------------------------
describe("ChatThreadScreen — microphone permission", () => {
  it("explains a refusal the OS will ask about again, and records nothing", async () => {
    mockPermission = { granted: false, status: "denied", canAskAgain: true };
    await openThread();
    await tapMic();
    await waitFor(() => expect(screen.getByText(/needs microphone access/)).toBeTruthy());
    expect(screen.queryByTestId("voice-recording-bar")).toBeNull();
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });

  it("says SETTINGS when the OS will not ask again", async () => {
    // `canAskAgain: false` is the whole reason there are two messages: "allow it"
    // is not an instruction the user can follow any more.
    mockPermission = { granted: false, status: "denied", canAskAgain: false };
    await openThread();
    await tapMic();
    await waitFor(() =>
      expect(screen.getByText(/Turn it on in Settings › MedApp › Microphone/)).toBeTruthy(),
    );
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });

  it("leaves typing working when the microphone is blocked", async () => {
    mockPermission = { granted: false, status: "denied", canAskAgain: false };
    await openThread();
    await tapMic();
    await waitFor(() => expect(screen.getByText(/Settings › MedApp › Microphone/)).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText("Message input"), "Typing instead");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Send message"));
    });
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith("t-1", "Typing instead"));
  });
});

// ---------------------------------------------------------------------------
// THE TRANSCRIPT
// ---------------------------------------------------------------------------
describe("ChatThreadScreen — a voice note on the wire renders a player", () => {
  const wireAttachment = (over: Record<string, unknown> = {}) => ({ ...staged({ messageId: "m-1" }), ...over });

  it("draws a player, not a file row with a download glyph", async () => {
    mockListMessages.mockResolvedValue([
      msg({ id: "m-1", senderUserId: "them", senderRole: "doctor", body: "", attachments: [wireAttachment()] }),
    ]);
    await openThread();
    await waitFor(() => expect(screen.getByLabelText("Play voice note")).toBeTruthy());
    // A file row would have announced the filename and a download control.
    expect(screen.queryByText("voice-note.m4a")).toBeNull();
  });

  it("shows the wire's duration before the audio has loaded", async () => {
    // 7400ms. The whole reason the backend persists `duration_ms` is so this
    // number exists without downloading the file.
    mockListMessages.mockResolvedValue([
      msg({ id: "m-1", senderUserId: "them", body: "", attachments: [wireAttachment()] }),
    ]);
    await openThread();
    await waitFor(() => expect(screen.getByText("0:07")).toBeTruthy());
  });

  it("still renders a DOCUMENT attachment as a file row", async () => {
    mockListMessages.mockResolvedValue([
      msg({
        id: "m-1",
        senderUserId: "them",
        body: "Your panel",
        attachments: [wireAttachment({ contentType: "application/pdf", durationMs: null, originalFilename: "Lab_Panel.pdf", byteSize: 2_400_000 })],
      }),
    ]);
    await openThread();
    await waitFor(() => expect(screen.getByText("Lab_Panel.pdf")).toBeTruthy());
    expect(screen.getByText("PDF · 2.4 MB")).toBeTruthy();
    expect(screen.queryByLabelText("Play voice note")).toBeNull();
  });
});

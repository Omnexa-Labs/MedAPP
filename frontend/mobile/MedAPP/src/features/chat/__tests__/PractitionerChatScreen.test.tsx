// The care-team room, Figma 1057:1448.
//
// These cases exist to lock the DIFFERENCE between the two threads, because
// both render through ChatThreadScreen. If the shared component ever stops
// honouring the group data, the patient suite would still pass and only these
// would catch it.

import { screen } from "@testing-library/react-native";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// ChatThreadScreen now genuinely depends on react-query — it reads a live
// thread when given a `threadId`. Hooks cannot be conditional, so
// useQuery/useQueryClient run even on the SEEDED path and the provider is
// required regardless. The app root already supplies one; these suites did not.
// A fresh client per render keeps cases isolated, and `retry: false` stops a
// rejected query burning three attempts.
function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
}));

// Composer media, mocked at the MODULE BOUNDARY exactly as ChatThreadScreen's
// own suite does — no test may reach a real native module. This screen renders
// through that component, so it inherits the whole expo-audio /
// expo-document-picker / expo-file-system surface and must stub the same three.
// The behavioural coverage of the hook itself lives in AiAssistantScreen.test.tsx.
// ChatThreadScreen now imports `@/hooks/use-current-user` at module scope to
// resolve message direction against the signed-in id. That reaches
// `@/store/auth-store` -> `@/lib/api/client` -> `@/lib/config`, whose
// `readExtra()` THROWS at require time under Jest — the exact landmine
// AccountMenu.tsx avoids with a lazy require. A lazy require is not available
// here (the id is needed during render, not on press), and only these two
// suites render the screen, so the mock is contained rather than imposed on ten.
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ id: "me", displayName: "Ama Mensah", avatarUrl: null }),
}));

// ...and `./api` reaches the same `@/lib/config` throw through `@/lib/api/client`.
// Neither suite exercises a live thread — they render the SEEDED path, which
// fires no request (the query is `enabled: Boolean(threadId)` and no threadId is
// pushed here) — so the module is stubbed rather than the config faked.
jest.mock("../api", () => ({
  chatApi: {
    listMessages: jest.fn(async () => []),
    sendMessage: jest.fn(async () => ({})),
    markRead: jest.fn(async () => ({})),
    listThreads: jest.fn(async () => []),
    getThread: jest.fn(async () => ({})),
  },
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock("expo-audio", () => {
  const recorder = {
    isRecording: false,
    uri: null as string | null,
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(() => {
      recorder.isRecording = true;
    }),
    stop: jest.fn(async () => {
      recorder.isRecording = false;
    }),
  };
  const permission = { granted: true, status: "granted", canAskAgain: true };
  return {
    RecordingPresets: { HIGH_QUALITY: { extension: ".m4a" }, LOW_QUALITY: { extension: ".m4a" } },
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
  class File {
    uri: string;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {}
  }
  return { File };
});

import { PractitionerChatScreen } from "../PractitionerChatScreen";
import { ChatThreadScreen } from "../ChatThreadScreen";

describe("PractitionerChatScreen", () => {
  it("names the ROOM, not a person", () => {
    render(<PractitionerChatScreen />);
    expect(screen.getByText("ICU Night Shift")).toBeTruthy();
    expect(screen.getByText("8 members · 3 online now")).toBeTruthy();
  });

  it("attributes each incoming message to its sender", () => {
    // The one thing that makes a group thread legible, and the one thing the
    // 1:1 correctly omits.
    render(<PractitionerChatScreen />);
    expect(screen.getByText("Dr. Kwabena Osei · Attending Physician")).toBeTruthy();
    expect(screen.getByText("Efua Asante · Head Nurse")).toBeTruthy();
  });

  it("renders join events, which only a room produces", () => {
    render(<PractitionerChatScreen />);
    expect(screen.getByText("Nii Tetteh joined the shift")).toBeTruthy();
  });

  it("uses the shift divider and the care-team composer", () => {
    render(<PractitionerChatScreen />);
    expect(screen.getByText("Shift started · 19:00")).toBeTruthy();
    expect(screen.getByPlaceholderText("Message the care team…")).toBeTruthy();
  });

  it("uses only seeded-roster names — no invented clinicians", () => {
    // The frame shipped "Dr. Sarah Chen", "Mark Thompson" and "Nurse Jennifer",
    // none of whom exist in the seed. That defect has now surfaced three times
    // (booking, the Account Menu, this frame), so it gets an assertion.
    render(<PractitionerChatScreen />);
    for (const invented of ["Sarah Chen", "Mark Thompson", "Nurse Jennifer"]) {
      expect(screen.queryByText(new RegExp(invented))).toBeNull();
    }
  });

  it("renders an attachment card for an INCOMING file", () => {
    // Regression: only OutgoingBubble had an attachment branch, so a file sent
    // by the other party silently dropped its payload and rendered as bare
    // text — in both frames.
    render(<PractitionerChatScreen />);
    expect(screen.getAllByText("Lab_Panel_May2026.pdf").length).toBeGreaterThanOrEqual(2);
  });

  it("leaves the patient 1:1 alone — no attribution, no room chrome", () => {
    render(<ChatThreadScreen />);
    expect(screen.queryByText("8 members · 3 online now")).toBeNull();
    expect(screen.queryByText(/joined the shift/)).toBeNull();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByPlaceholderText("Type a message…")).toBeTruthy();
  });
});

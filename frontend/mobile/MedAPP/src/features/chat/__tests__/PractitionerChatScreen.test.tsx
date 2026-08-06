// The care-team room, Figma 1057:1448.
//
// These cases exist to lock the DIFFERENCE between the two threads, because
// both render through ChatThreadScreen. If the shared component ever stops
// honouring the group data, the patient suite would still pass and only these
// would catch it.

import { screen } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));

// Composer media, mocked at the MODULE BOUNDARY exactly as ChatThreadScreen's
// own suite does — no test may reach a real native module. This screen renders
// through that component, so it inherits the whole expo-audio /
// expo-document-picker / expo-file-system surface and must stub the same three.
// The behavioural coverage of the hook itself lives in AiAssistantScreen.test.tsx.
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

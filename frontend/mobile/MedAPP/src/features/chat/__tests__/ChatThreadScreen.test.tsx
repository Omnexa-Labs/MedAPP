// Locks the DetailShell migration for ChatThreadScreen.
//
// The regression that matters here is not the chrome — it is the COMPOSER. This
// screen pins an input bar to the bottom edge under a KeyboardAvoidingView, so
// two things must survive the migration or the app becomes unusable for
// messaging:
//
//   1. The KAV must stay BELOW the app bar and must contain the composer. A
//      shell-level KAV (or one moved above the bar) lifts the bar off the top of
//      the screen when the keyboard opens.
//   2. The shell must NOT claim the bottom safe-area inset. A static bottom pad
//      stays put when the keyboard rises, leaving a ~34px gap between the
//      composer and the keyboard.
//
// Plus the drift the shell exists to remove: a frozen `<StatusBar style="dark" />`
// that a single-mode render assertion cannot catch — in light mode the frozen
// value is the correct one. The only test shape that fails on a re-frozen literal
// renders BOTH modes and asserts they differ.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { screen, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { renderWithSafeArea as render } from "@/test/safe-area";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => ({}),
}));

const mockScheme = { value: "light" as "light" | "dark" };

// nativewind is the single source of the rendered scheme (src/lib/theme.ts reads
// it), so this is the seam for exercising both modes.
jest.mock("nativewind", () => ({
  useColorScheme: () => ({
    colorScheme: mockScheme.value,
    setColorScheme: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Composer media mocks. Mocked at the MODULE BOUNDARY, like the router and
// nativewind mocks above — no test may reach a real native module. Mutable state
// lives inside each factory and is reached via `jest.requireMock` at test time,
// because babel hoists the `../ChatThreadScreen` import above the top-level
// `const`s and a closure over one would hit its temporal dead zone.
//
// The exhaustive coverage of the shared hook (denial, blocked, capture failure,
// picker failure) lives in AiAssistantScreen.test.tsx. What THIS file locks is
// that this screen's two controls — which shipped with no `onPress` at all — are
// wired to it, and that its own attachment message shape is populated.
// ---------------------------------------------------------------------------

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
      recorder.uri = "file:///cache/AV/recording-1.m4a";
    }),
  };
  const permission = { granted: true, status: "granted", canAskAgain: true };
  return {
    __recorder: recorder,
    __permission: permission,
    RecordingPresets: { HIGH_QUALITY: { extension: ".m4a" }, LOW_QUALITY: { extension: ".m4a" } },
    useAudioRecorder: () => recorder,
    getRecordingPermissionsAsync: jest.fn(async () => ({ ...permission })),
    requestRecordingPermissionsAsync: jest.fn(async () => ({ ...permission })),
    setAudioModeAsync: jest.fn(async () => {}),
  };
});

jest.mock("expo-file-system", () => {
  const deleted: string[] = [];
  class File {
    uri: string;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {
      deleted.push(this.uri);
    }
  }
  return { File, __deleted: deleted };
});

import { ChatThreadScreen } from "../ChatThreadScreen";

const SOURCE_PATH = join(__dirname, "..", "ChatThreadScreen.tsx");

/** The migration notes name the very literals these tests ban; prose must not fail them. */
function code(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

type PermissionShape = { granted: boolean; status: string; canAskAgain: boolean };

function picker() {
  return jest.requireMock("expo-document-picker") as { getDocumentAsync: jest.Mock };
}

function audio() {
  return jest.requireMock("expo-audio") as {
    __recorder: { isRecording: boolean; uri: string | null; stop: jest.Mock; record: jest.Mock };
    __permission: PermissionShape;
    getRecordingPermissionsAsync: jest.Mock;
    requestRecordingPermissionsAsync: jest.Mock;
    setAudioModeAsync: jest.Mock;
  };
}

function fs() {
  return jest.requireMock("expo-file-system") as { __deleted: string[] };
}

function setMicPermission(next: PermissionShape) {
  const a = audio();
  Object.assign(a.__permission, next);
  a.getRecordingPermissionsAsync.mockReset();
  a.requestRecordingPermissionsAsync.mockReset();
  a.getRecordingPermissionsAsync.mockImplementation(async () => ({ ...next }));
  a.requestRecordingPermissionsAsync.mockImplementation(async () => ({ ...next }));
}

const PICKED_PDF = {
  canceled: false as const,
  assets: [
    {
      uri: "file:///cache/DocumentPicker/Referral.pdf",
      name: "Referral.pdf",
      size: 812_000,
      mimeType: "application/pdf",
      lastModified: 0,
    },
  ],
};

/** Every composer-media handler is async, so the press has to be flushed. */
async function pressAsync(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
}

beforeEach(() => {
  mockBack.mockClear();
  mockScheme.value = "light";

  const a = audio();
  a.__recorder.isRecording = false;
  a.__recorder.uri = null;
  a.__recorder.stop.mockClear();
  a.__recorder.record.mockClear();
  a.setAudioModeAsync.mockClear();
  setMicPermission({ granted: true, status: "granted", canAskAgain: true });

  picker().getDocumentAsync.mockReset();
  picker().getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });

  fs().__deleted.length = 0;
});

describe("ChatThreadScreen — renders through DetailShell", () => {
  it("keeps the bar's title, subtitle, avatar, presence dot and both actions", () => {
    render(<ChatThreadScreen />);

    expect(screen.getByText("Dr. Adjoa Boateng")).toBeTruthy();
    expect(screen.getByText("Doctor · Cardiologist")).toBeTruthy();
    expect(screen.getByLabelText("Dr. Adjoa Boateng")).toBeTruthy(); // avatar
    expect(screen.getByLabelText("Online")).toBeTruthy();
    expect(screen.getByLabelText("Video call")).toBeTruthy();
    expect(screen.getByLabelText("Conversation info")).toBeTruthy();
  });

  it("routes the back button through the shell to router.back()", () => {
    render(<ChatThreadScreen />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("renders no bottom nav — a detail screen must not have one", () => {
    render(<ChatThreadScreen />);
    for (const label of ["Home", "Overview", "Inbox", "Community", "Lifestyle"]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    expect(code()).not.toMatch(/BottomNav/);
  });

  it("hand-rolls no wrapper of its own any more", () => {
    const src = code();
    expect(src).not.toMatch(/SafeAreaView/);
    expect(src).not.toMatch(/\bStatusBar\b/);
    expect(src).not.toMatch(/style="dark"/);
    expect(src).toMatch(/DetailShell/);
    // The bar is reached through the shell, never rendered beside it.
    expect(src).not.toMatch(/<DetailAppBar/);
  });
});

describe("ChatThreadScreen — status bar follows the scheme", () => {
  const statusBarStyle = () => {
    const bars = screen.UNSAFE_queryAllByType(StatusBar);
    expect(bars).toHaveLength(1);
    return bars[0].props.style;
  };

  it("produces a DIFFERENT style in the two modes — the frozen `dark` fails this", () => {
    mockScheme.value = "light";
    render(<ChatThreadScreen />);
    const light = statusBarStyle();
    expect(light).toBe("dark");
    screen.unmount();

    mockScheme.value = "dark";
    render(<ChatThreadScreen />);
    expect(statusBarStyle()).toBe("light");
    expect(statusBarStyle()).not.toBe(light);
  });
});

describe("ChatThreadScreen — the composer still clears the keyboard", () => {
  it("leaves the bottom inset to the screen, exactly as before the migration", () => {
    render(<ChatThreadScreen />);
    const areas = screen.UNSAFE_queryAllByType(SafeAreaView);
    expect(areas).toHaveLength(1);
    // `claimsBottomInset={false}`. A shell-claimed bottom pad does not move when
    // the keyboard opens, so the composer would float above it.
    expect(areas[0].props.edges).toEqual(["top", "left", "right"]);
  });

  it("keeps the composer INSIDE the KeyboardAvoidingView", () => {
    render(<ChatThreadScreen />);
    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView);

    expect(kav.findAllByProps({ accessibilityLabel: "Message input" }).length).toBeGreaterThan(0);
    expect(kav.findAllByProps({ accessibilityLabel: "Send message" }).length).toBeGreaterThan(0);
    // …and the scroll canvas too, so the messages rise with it.
    expect(kav.findAllByType(ScrollView).length).toBeGreaterThan(0);
  });

  it("keeps the app bar OUTSIDE the KeyboardAvoidingView", () => {
    render(<ChatThreadScreen />);
    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView);
    // A KAV wrapped around the bar pushes it off the top of the screen when the
    // keyboard opens — the failure mode the shell's header argues at length.
    expect(kav.findAllByProps({ accessibilityLabel: "Go back" })).toHaveLength(0);
    expect(kav.findAllByProps({ accessibilityLabel: "Video call" })).toHaveLength(0);
  });

  it("preserves the KAV's own configuration verbatim", () => {
    render(<ChatThreadScreen />);
    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(kav.props.behavior).toBe(Platform.OS === "ios" ? "padding" : undefined);
    expect(kav.props.keyboardVerticalOffset).toBe(0);
  });

  it("keeps the scroll padding unchanged — no bottom nav reserve to drop", () => {
    render(<ChatThreadScreen />);
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.contentContainerStyle).toEqual({
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 24,
    });
  });
});

describe("ChatThreadScreen — behaviour is untouched", () => {
  it("still sends a message and still opens the clinical menu", () => {
    jest.useFakeTimers();
    try {
      render(<ChatThreadScreen />);

      fireEvent.changeText(screen.getByLabelText("Message input"), "Feeling better today");
      fireEvent.press(screen.getByLabelText("Send message"));
      expect(screen.getByText("Feeling better today")).toBeTruthy();

      fireEvent.press(screen.getByLabelText("Share clinical data"));
      expect(screen.getByLabelText("Share Vitals Trends")).toBeTruthy();

      // The canned reply is still on its timer.
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText(/I'll review that and get back to you shortly/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Composer media
//
// The defect: BOTH "Attach file" and "Voice message" were `<Pressable>`s with no
// `onPress` — dead 44pt targets, exactly like AiAssistantScreen's pair. A label
// assertion passes on a dead control, so every case asserts an EFFECT.
// ---------------------------------------------------------------------------

describe("ChatThreadScreen — attach", () => {
  it("opens the SDK 55 picker in single-select mode and shows what was picked", async () => {
    picker().getDocumentAsync.mockResolvedValueOnce(PICKED_PDF);
    render(<ChatThreadScreen />);

    await pressAsync("Attach file");

    expect(picker().getDocumentAsync).toHaveBeenCalledWith({
      type: "*/*",
      multiple: false,
      copyToCacheDirectory: true,
    });
    expect(screen.getByTestId("composer-attachment-chip")).toBeTruthy();
    expect(screen.getByText("Referral.pdf")).toBeTruthy();
    expect(screen.getByText(/PDF · 812 KB/)).toBeTruthy();
  });

  it("sends it through this screen's OWN attachment message kind", async () => {
    picker().getDocumentAsync.mockResolvedValueOnce(PICKED_PDF);
    render(<ChatThreadScreen />);

    await pressAsync("Attach file");
    await pressAsync("Send message");

    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
    // Rendered by the pre-existing OutgoingBubble attachment card, not a new one.
    expect(screen.getByText("Referral.pdf")).toBeTruthy();
    expect(screen.getByText(/on this device only/)).toBeTruthy();
    // The message references the file, so consuming must not reap it.
    expect(fs().__deleted).toHaveLength(0);
  });

  it("sends with an EMPTY draft once something is attached", async () => {
    picker().getDocumentAsync.mockResolvedValueOnce(PICKED_PDF);
    render(<ChatThreadScreen />);

    await pressAsync("Attach file");
    expect(screen.getByLabelText("Send message").props.accessibilityState.disabled).toBe(false);
    await pressAsync("Send message");
    expect(screen.getByText("Referral.pdf")).toBeTruthy();
  });

  it("keeps the SEEDED (already-uploaded) attachment's download affordance", () => {
    render(<ChatThreadScreen />);
    // Lab_Panel_May2026.pdf has no `localUri`, so it is NOT device-local media and
    // its download glyph must survive the suppression added for local files.
    expect(screen.getByText("Lab_Panel_May2026.pdf")).toBeTruthy();
    expect(screen.getByText("PDF · 2.4 MB")).toBeTruthy();
  });

  it("a DISMISSED picker leaves nothing stuck", async () => {
    render(<ChatThreadScreen />);

    await pressAsync("Attach file");

    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
    expect(screen.queryByTestId("composer-media-notice")).toBeNull();
    await pressAsync("Attach file");
    expect(picker().getDocumentAsync).toHaveBeenCalledTimes(2);
  });
});

describe("ChatThreadScreen — mic", () => {
  it("records on the first press and commits an attachment on the second", async () => {
    render(<ChatThreadScreen />);

    await pressAsync("Voice message");
    const a = audio();
    expect(a.setAudioModeAsync).toHaveBeenCalledWith({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    expect(a.__recorder.record).toHaveBeenCalled();
    expect(screen.getByTestId("composer-recording-bar")).toBeTruthy();

    await pressAsync("Stop recording");
    expect(a.__recorder.stop).toHaveBeenCalled();
    // Session handed back, so the OS mic indicator clears.
    expect(a.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
    expect(screen.getByText("Voice note")).toBeTruthy();
    expect(screen.getByLabelText("Voice message")).toBeTruthy();
  });

  it("discards a recording without attaching it, and reaps the file", async () => {
    render(<ChatThreadScreen />);

    await pressAsync("Voice message");
    await pressAsync("Discard recording");

    expect(audio().__recorder.stop).toHaveBeenCalled();
    expect(screen.queryByTestId("composer-recording-bar")).toBeNull();
    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
    expect(fs().__deleted).toEqual(["file:///cache/AV/recording-1.m4a"]);
  });

  it("explains a permission DENIAL rather than doing nothing", async () => {
    setMicPermission({ granted: false, status: "denied", canAskAgain: true });
    render(<ChatThreadScreen />);

    await pressAsync("Voice message");

    expect(audio().__recorder.record).not.toHaveBeenCalled();
    expect(screen.getByTestId("composer-media-notice")).toBeTruthy();
    expect(screen.getByText(/needs microphone access/)).toBeTruthy();
    expect(screen.getByLabelText("Voice message")).toBeTruthy();
  });
});

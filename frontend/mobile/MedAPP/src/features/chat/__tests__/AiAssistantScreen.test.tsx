// Locks the DetailShell migration for AiAssistantScreen.
//
// Same contract as the ChatThreadScreen test, and for the same reason: this is
// the second of the two composer screens, so the keyboard is the thing a shell
// migration can silently break. The composer must stay inside the
// KeyboardAvoidingView, the app bar must stay outside it, and the shell must not
// claim the bottom inset (a static pad does not move when the keyboard rises).
//
// The status-bar assertion renders BOTH modes and asserts they differ — the only
// shape that fails on a re-frozen `style="dark"`, which in light mode looks right.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KeyboardAvoidingView as KeyboardAvoidingViewForRegression, ScrollView } from "react-native";
import { KeyboardInset } from "@/components/ui";
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
}));

const mockScheme = { value: "light" as "light" | "dark" };

jest.mock("nativewind", () => ({
  useColorScheme: () => ({
    colorScheme: mockScheme.value,
    setColorScheme: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Composer media mocks.
//
// Mocked at the MODULE BOUNDARY, the same seam the router and nativewind mocks
// use. No test may reach a real native module: expo-document-picker would try to
// present a system UI, expo-audio would try to open an audio session, and
// expo-file-system would try to unlink a real path.
//
// The mutable state lives INSIDE each factory and is reached through
// `jest.requireMock` at test time, not through a closure over a `const`. That is
// deliberate: babel hoists the `../AiAssistantScreen` import above the top-level
// `const`s, so a factory that closed over one would evaluate in its temporal
// dead zone.
// ---------------------------------------------------------------------------

jest.mock("expo-document-picker", () => ({
  // Default: the user dismisses. `canceled` is spelled with ONE l, per the SDK
  // 55 DocumentPicker docs, and the canceled result carries `assets: null`.
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock("expo-audio", () => {
  const recorder = {
    isRecording: false,
    uri: null as string | null,
    prepareToRecordAsync: jest.fn(async () => {}),
    // SDK 55: `record()` is synchronous and returns void; only `stop()` is a
    // promise, and `uri` is readable only after it resolves.
    record: jest.fn(() => {
      recorder.isRecording = true;
    }),
    stop: jest.fn(async () => {
      recorder.isRecording = false;
      recorder.uri = "file:///cache/AV/recording-1.m4a";
    }),
  };
  const permission = {
    granted: true,
    status: "granted" as "granted" | "denied" | "undetermined",
    canAskAgain: true,
  };
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

import { AiAssistantScreen } from "../AiAssistantScreen";

const SOURCE_PATH = join(__dirname, "..", "AiAssistantScreen.tsx");

function code(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

/** The chat canvas, not the quick-action chip row (which is also a ScrollView). */
function canvas() {
  return screen.UNSAFE_getAllByType(ScrollView)[0];
}

// ---------------------------------------------------------------------------
// Composer-media test helpers
// ---------------------------------------------------------------------------

type PermissionShape = { granted: boolean; status: string; canAskAgain: boolean };

function picker() {
  return jest.requireMock("expo-document-picker") as {
    getDocumentAsync: jest.Mock;
  };
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

/** The permission state both `get` and `request` will report. */
function setMicPermission(next: PermissionShape) {
  const a = audio();
  Object.assign(a.__permission, next);
  // `mockReset`, not `mockImplementation`: an implementation swap leaves the call
  // history intact, and "did we ask?" is the assertion in the blocked-permission
  // case, so a stale count from a previous test would pass it wrongly.
  a.getRecordingPermissionsAsync.mockReset();
  a.requestRecordingPermissionsAsync.mockReset();
  a.getRecordingPermissionsAsync.mockImplementation(async () => ({ ...next }));
  a.requestRecordingPermissionsAsync.mockImplementation(async () => ({ ...next }));
}

const PICKED_PDF = {
  canceled: false as const,
  assets: [
    {
      uri: "file:///cache/DocumentPicker/Lab_Panel_Aug2026.pdf",
      name: "Lab_Panel_Aug2026.pdf",
      size: 2_400_000,
      mimeType: "application/pdf",
      lastModified: 0,
    },
  ],
};

/**
 * Presses a control and flushes the microtask queue the handler kicks off. Every
 * composer-media handler is `async`, so a bare `fireEvent.press` would assert
 * against the state before the picker/permission promise resolved.
 */
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

describe("AiAssistantScreen — renders through DetailShell", () => {
  it("keeps the bar's title, avatar and action", () => {
    render(<AiAssistantScreen />);
    expect(screen.getByText("MedAI")).toBeTruthy();
    expect(screen.getByLabelText("Your profile")).toBeTruthy();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
  });

  it("routes the back button through the shell to router.back()", () => {
    render(<AiAssistantScreen />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("renders no bottom nav — a detail screen must not have one", () => {
    render(<AiAssistantScreen />);
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
    expect(src).not.toMatch(/<DetailAppBar/);
  });
});

describe("AiAssistantScreen — status bar follows the scheme", () => {
  const statusBarStyle = () => {
    const bars = screen.UNSAFE_queryAllByType(StatusBar);
    expect(bars).toHaveLength(1);
    return bars[0].props.style;
  };

  it("produces a DIFFERENT style in the two modes — the frozen `dark` fails this", () => {
    mockScheme.value = "light";
    render(<AiAssistantScreen />);
    const light = statusBarStyle();
    expect(light).toBe("dark");
    screen.unmount();

    mockScheme.value = "dark";
    render(<AiAssistantScreen />);
    expect(statusBarStyle()).toBe("light");
    expect(statusBarStyle()).not.toBe(light);
  });
});

describe("AiAssistantScreen — the composer still clears the keyboard", () => {
  it("leaves the bottom inset to the screen, exactly as before the migration", () => {
    render(<AiAssistantScreen />);
    const areas = screen.UNSAFE_queryAllByType(SafeAreaView);
    expect(areas).toHaveLength(1);
    expect(areas[0].props.edges).toEqual(["top", "left", "right"]);
  });

  it("keeps the composer and the quick-action chips INSIDE the KeyboardInset", () => {
    render(<AiAssistantScreen />);
    const kav = screen.UNSAFE_getByType(KeyboardInset);
    expect(kav.findAllByProps({ accessibilityLabel: "Message MedAI" }).length).toBeGreaterThan(0);
    expect(kav.findAllByProps({ accessibilityLabel: "Send message" }).length).toBeGreaterThan(0);
    expect(kav.findAllByType(ScrollView).length).toBeGreaterThan(0);
  });

  it("keeps the app bar OUTSIDE the KeyboardInset", () => {
    render(<AiAssistantScreen />);
    const kav = screen.UNSAFE_getByType(KeyboardInset);
    expect(kav.findAllByProps({ accessibilityLabel: "Go back" })).toHaveLength(0);
    expect(kav.findAllByProps({ accessibilityLabel: "Notifications" })).toHaveLength(0);
  });

  it("uses KeyboardInset, because a KeyboardAvoidingView cannot work here", () => {
    // This test asserted `behavior === (ios ? "padding" : undefined)` — it
    // LOCKED IN the broken configuration. On Android that expression means "do
    // nothing", and under SDK 55 edge-to-edge the window is never resized, so a
    // KAV has no signal to work from at all. Verified on device: with
    // behavior="padding" forced, the composer was still hidden by the keyboard.
    //
    // So the assertion is inverted: there must be NO KeyboardAvoidingView left,
    // and the inset component must be the one wrapping the composer.
    render(<AiAssistantScreen />);
    expect(screen.UNSAFE_queryAllByType(KeyboardAvoidingViewForRegression)).toHaveLength(0);
    expect(screen.UNSAFE_getByType(KeyboardInset)).toBeTruthy();
  });

  it("keeps the scroll padding unchanged — no bottom nav reserve to drop", () => {
    render(<AiAssistantScreen />);
    expect(canvas().props.contentContainerStyle).toEqual({
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 16,
    });
  });
});

describe("AiAssistantScreen — behaviour is untouched", () => {
  it("still sends a typed message and still fires the quick actions", () => {
    jest.useFakeTimers();
    try {
      render(<AiAssistantScreen />);

      fireEvent.changeText(screen.getByLabelText("Message MedAI"), "My head still hurts");
      fireEvent.press(screen.getByLabelText("Send message"));
      expect(screen.getByText("My head still hurts")).toBeTruthy();

      fireEvent.press(screen.getByText("Check Vitals"));
      expect(screen.getAllByText("Check Vitals").length).toBeGreaterThan(1);

      act(() => {
        jest.advanceTimersByTime(900);
      });
      expect(screen.getAllByText(/Thanks for sharing that/).length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Composer media
//
// The defect these lock: "Attach file" and "Voice input" shipped as
// `<IconButton>` with NO `onPress` — two dead 44pt targets. A test that only
// asserts the label exists passes on a dead control, so every case below asserts
// an EFFECT of the press.
// ---------------------------------------------------------------------------

describe("AiAssistantScreen — attach", () => {
  it("opens the SDK 55 picker in single-select mode and shows what was picked", async () => {
    picker().getDocumentAsync.mockResolvedValueOnce(PICKED_PDF);
    render(<AiAssistantScreen />);

    await pressAsync("Attach file");

    expect(picker().getDocumentAsync).toHaveBeenCalledWith({
      type: "*/*",
      multiple: false,
      copyToCacheDirectory: true,
    });
    expect(screen.getByTestId("composer-attachment-chip")).toBeTruthy();
    expect(screen.getByText("Lab_Panel_Aug2026.pdf")).toBeTruthy();
    // MIME subtype uppercased + decimal size, matching the seeded bubble's format.
    expect(screen.getByText(/PDF · 2\.4 MB/)).toBeTruthy();
    // The absence of an upload endpoint is stated in the UI, not hidden.
    expect(screen.getByText(/not sent yet/)).toBeTruthy();
  });

  it("attaches it to the sent message and frees the composer slot", async () => {
    picker().getDocumentAsync.mockResolvedValueOnce(PICKED_PDF);
    render(<AiAssistantScreen />);

    await pressAsync("Attach file");
    await pressAsync("Send message");

    // The chip is gone from the composer…
    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
    // …and the file is named in the bubble instead.
    expect(screen.getByText("Lab_Panel_Aug2026.pdf")).toBeTruthy();
    expect(screen.getByText(/on this device only/)).toBeTruthy();
    // Consuming an attachment must NOT reap the file — the bubble references it.
    expect(fs().__deleted).toHaveLength(0);
  });

  it("sends an attachment with an EMPTY draft — the old guard blocked that", async () => {
    picker().getDocumentAsync.mockResolvedValueOnce(PICKED_PDF);
    render(<AiAssistantScreen />);

    await pressAsync("Attach file");
    expect(screen.getByLabelText("Send message").props.accessibilityState.disabled).toBe(false);

    await pressAsync("Send message");
    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
  });

  it("removing the attachment is possible, and does not delete a picked FILE", async () => {
    picker().getDocumentAsync.mockResolvedValueOnce(PICKED_PDF);
    render(<AiAssistantScreen />);

    await pressAsync("Attach file");
    await pressAsync("Remove attachment Lab_Panel_Aug2026.pdf");

    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
    // Only captures we created are reaped; a re-pick can hand back the same uri.
    expect(fs().__deleted).toHaveLength(0);
  });

  it("a DISMISSED picker leaves nothing stuck and no notice", async () => {
    render(<AiAssistantScreen />); // default mock resolves { canceled: true }

    await pressAsync("Attach file");

    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
    expect(screen.queryByTestId("composer-media-notice")).toBeNull();
    // Still live: a second press re-opens the picker.
    await pressAsync("Attach file");
    expect(picker().getDocumentAsync).toHaveBeenCalledTimes(2);
  });

  it("surfaces a picker FAILURE instead of silently doing nothing", async () => {
    picker().getDocumentAsync.mockRejectedValueOnce(new Error("provider went away"));
    render(<AiAssistantScreen />);

    await pressAsync("Attach file");

    expect(screen.getByTestId("composer-media-notice")).toBeTruthy();
    expect(screen.getByText(/could not be opened/)).toBeTruthy();

    // …and the notice is clearable, so it can't outlive its cause.
    await pressAsync("Dismiss message");
    expect(screen.queryByTestId("composer-media-notice")).toBeNull();
  });

  it("renders the unimplemented camera control as DISABLED, not as dead", () => {
    render(<AiAssistantScreen />);
    expect(screen.getByLabelText("Take photo").props.accessibilityState.disabled).toBe(true);
  });
});

describe("AiAssistantScreen — mic", () => {
  it("requests permission, opens a recording session, and shows a live indicator", async () => {
    render(<AiAssistantScreen />);

    await pressAsync("Voice input");

    const a = audio();
    expect(a.getRecordingPermissionsAsync).toHaveBeenCalled();
    // The session pair the SDK 55 recording example sets.
    expect(a.setAudioModeAsync).toHaveBeenCalledWith({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    expect(a.__recorder.record).toHaveBeenCalled();
    expect(screen.getByTestId("composer-recording-bar")).toBeTruthy();
    expect(screen.getByText(/Recording ·/)).toBeTruthy();
    // The label follows the state, so the next tap is announced correctly.
    expect(screen.getByLabelText("Stop recording")).toBeTruthy();
    expect(screen.queryByLabelText("Voice input")).toBeNull();
  });

  it("a second press commits the capture as an attachment and releases the session", async () => {
    render(<AiAssistantScreen />);

    await pressAsync("Voice input");
    await pressAsync("Stop recording");

    const a = audio();
    expect(a.__recorder.stop).toHaveBeenCalled();
    expect(a.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
    expect(screen.queryByTestId("composer-recording-bar")).toBeNull();
    expect(screen.getByTestId("composer-attachment-chip")).toBeTruthy();
    expect(screen.getByText("Voice note")).toBeTruthy();
    expect(screen.getByText(/Audio · \d+:\d\d/)).toBeTruthy();
    expect(screen.getByLabelText("Voice input")).toBeTruthy();
  });

  it("discarding an in-flight recording stops the recorder AND reaps the file", async () => {
    render(<AiAssistantScreen />);

    await pressAsync("Voice input");
    await pressAsync("Discard recording");

    const a = audio();
    // Cancelling still has to stop: abandoning would leave the OS mic indicator lit.
    expect(a.__recorder.stop).toHaveBeenCalled();
    expect(screen.queryByTestId("composer-recording-bar")).toBeNull();
    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
    expect(fs().__deleted).toEqual(["file:///cache/AV/recording-1.m4a"]);
  });

  it("explains a DENIAL in words and stays usable — no silent no-op", async () => {
    setMicPermission({ granted: false, status: "denied", canAskAgain: true });
    render(<AiAssistantScreen />);

    await pressAsync("Voice input");

    expect(audio().__recorder.record).not.toHaveBeenCalled();
    expect(screen.queryByTestId("composer-recording-bar")).toBeNull();
    expect(screen.getByTestId("composer-media-notice")).toBeTruthy();
    expect(screen.getByText(/needs microphone access/)).toBeTruthy();
    // Still the idle control, so the user can grant and retry.
    expect(screen.getByLabelText("Voice input")).toBeTruthy();
  });

  it("says SETTINGS when the OS will not prompt again (canAskAgain: false)", async () => {
    setMicPermission({ granted: false, status: "denied", canAskAgain: false });
    render(<AiAssistantScreen />);

    await pressAsync("Voice input");

    const a = audio();
    // Pointless to ask — and asking would be a tap that visibly does nothing.
    expect(a.requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/Settings/)).toBeTruthy();
  });

  it("reports a capture that produced no file rather than attaching nothing", async () => {
    const a = audio();
    a.__recorder.stop.mockImplementationOnce(async () => {
      a.__recorder.isRecording = false;
      a.__recorder.uri = null;
    });
    render(<AiAssistantScreen />);

    await pressAsync("Voice input");
    await pressAsync("Stop recording");

    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
    expect(screen.getByText(/could not be saved/)).toBeTruthy();
  });
});

describe("AiAssistantScreen — BRAND compliance", () => {
  it("imports no icon library — the icon gate is the only file allowed to", () => {
    const src = code();
    expect(src).not.toMatch(/@expo\/vector-icons/);
    expect(src).not.toMatch(/MaterialIcons/);
  });

  it("carries no raw colour literals, including white", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\(/);
    // `text-white` is the class form of the same violation.
    expect(src).not.toMatch(/\btext-white\b/);
  });

  it("pairs the send glyph with WHICHEVER fill it is sitting on", () => {
    // Was: assert the glyph is literally `color={onPrimary}`. That caught the
    // original defect (a frozen `#ffffff`) but then FROZE A SECOND ONE, because
    // the button has two fills and only one of them is `primary`.
    //
    // With an empty draft the background is `outline-variant`, and an
    // `on-primary` glyph on it measures ~1.4:1 in light and ~1.3:1 in dark —
    // invisible in both, and an empty draft is the default state. Reported from
    // the device exactly that way.
    //
    // So the assertion is now about the PAIRING, not one token name: both tokens
    // must be present and the glyph must choose between them.
    const src = code();
    expect(src).toMatch(/useTokenColor\("on-primary"\)/);
    expect(src).toMatch(/useTokenColor\("on-surface-variant"\)/);
    expect(src).toMatch(/<Icon[\s\S]*?chrome="send"[\s\S]*?color=\{[^}]*\?[^}]*onPrimary[^}]*:[^}]*mutedGlyph[^}]*\}/);
    // And no frozen literal, which is what the original test existed to prevent.
    expect(src).not.toMatch(/chrome="send"[\s\S]{0,200}#[0-9a-fA-F]{6}/);
  });
});

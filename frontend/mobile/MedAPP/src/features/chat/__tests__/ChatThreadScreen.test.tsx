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
import { KeyboardAvoidingView as KeyboardAvoidingViewForRegression, ScrollView } from "react-native";
import { KeyboardInset } from "@/components/ui";
import { screen, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
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

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => ({}),
  // The transcript query polls only while focused. No `threadId` is pushed in
  // this suite, so the query is disabled anyway — the hook still has to exist.
  useIsFocused: () => true,
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
// picker failure) used to live in AiAssistantScreen.test.tsx. That screen has no
// composer any more — there is no assistant behind it, so a composer there was a
// dead control with a keyboard attached — and this screen is now the hook's only
// consumer, so the coverage moved here rather than being deleted with it.
// ---------------------------------------------------------------------------

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
  it("keeps the bar's title, subtitle and avatar", () => {
    render(<ChatThreadScreen />);

    expect(screen.getByText("Dr. Adjoa Boateng")).toBeTruthy();
    expect(screen.getByText("Doctor · Cardiologist")).toBeTruthy();
    expect(screen.getByLabelText("Dr. Adjoa Boateng")).toBeTruthy(); // avatar
  });

  it("draws NO presence dot, even on the seeded thread", () => {
    // It used to be unconditional (`SEED_CONTACT.isOnline: true`, not
    // param-overridable), so every thread asserted that a clinician was online.
    // Nothing in inbox_service models connectivity — `is_active` is membership.
    render(<ChatThreadScreen />);
    expect(screen.queryByLabelText("Online")).toBeNull();
  });

  it("draws the dot when — and only when — a caller states presence", () => {
    // The prop exists so the claim has an owner. No caller passes it today.
    render(<ChatThreadScreen isOnline />);
    expect(screen.getByLabelText("Online")).toBeTruthy();
  });

  it("draws neither of the bar's two dead actions", () => {
    // "Conversation info" had no `onPress` at all. "Video call"'s body was a
    // TODO — and there is no video transport in this product for it to reach,
    // so a camera glyph on a doctor thread promised an escalation that does not
    // exist. Asserted as ABSENCES so neither can quietly return.
    render(<ChatThreadScreen />);
    expect(screen.queryByLabelText("Conversation info")).toBeNull();
    expect(screen.queryByLabelText("Video call")).toBeNull();
    expect(code()).not.toMatch(/videocam/);
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

  it("keeps the composer INSIDE the KeyboardInset", () => {
    render(<ChatThreadScreen />);
    const kav = screen.UNSAFE_getByType(KeyboardInset);

    expect(kav.findAllByProps({ accessibilityLabel: "Message input" }).length).toBeGreaterThan(0);
    expect(kav.findAllByProps({ accessibilityLabel: "Send message" }).length).toBeGreaterThan(0);
    // …and the scroll canvas too, so the messages rise with it.
    expect(kav.findAllByType(ScrollView).length).toBeGreaterThan(0);
  });

  it("keeps the app bar OUTSIDE the KeyboardInset", () => {
    render(<ChatThreadScreen />);
    const kav = screen.UNSAFE_getByType(KeyboardInset);
    // A KAV wrapped around the bar pushes it off the top of the screen when the
    // keyboard opens — the failure mode the shell's header argues at length.
    expect(kav.findAllByProps({ accessibilityLabel: "Go back" })).toHaveLength(0);
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
    render(<ChatThreadScreen />);
    expect(screen.UNSAFE_queryAllByType(KeyboardAvoidingViewForRegression)).toHaveLength(0);
    expect(screen.UNSAFE_getByType(KeyboardInset)).toBeTruthy();
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

describe("ChatThreadScreen — the composer still composes, and claims nothing", () => {
  it("appends the message and NEVER produces a reply, on any timer", () => {
    // This case used to assert the opposite — that after 1000ms an INCOMING
    // bubble reading "I'll review that and get back to you shortly" appeared.
    // That bubble was attributed by the app bar to the clinician named there and
    // fired on live threads too. It is deleted, not gated, so the assertion is
    // inverted and the window widened well past the old delay.
    jest.useFakeTimers();
    try {
      render(<ChatThreadScreen />);

      fireEvent.changeText(screen.getByLabelText("Message input"), "Feeling better today");
      fireEvent.press(screen.getByLabelText("Send message"));
      expect(screen.getByText("Feeling better today")).toBeTruthy();

      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(screen.queryByText(/I'll review that and get back to you shortly/)).toBeNull();
      expect(code()).not.toMatch(/CANNED_REPLY/);
    } finally {
      jest.useRealTimers();
    }
  });

  it("says so when a send is not being transmitted, instead of ticking it", () => {
    // No `threadId` on this path, so nothing is POSTed. The bubble used to carry
    // `delivered: true` regardless — a green double tick on a message that never
    // left the handset.
    render(<ChatThreadScreen />);
    fireEvent.changeText(screen.getByLabelText("Message input"), "Feeling better today");
    fireEvent.press(screen.getByLabelText("Send message"));
    expect(screen.getByText(/Not sent — this conversation isn't connected/)).toBeTruthy();
  });

  it("no longer offers a clinical share menu that shares nothing", () => {
    // Each row sent the literal string "[Shared: Medical History]" and attached
    // no record. `ThreadMessageCreate` is `{ body }` — there was nothing to
    // attach it to.
    render(<ChatThreadScreen />);
    expect(screen.queryByLabelText("Share clinical data")).toBeNull();
    expect(screen.queryByLabelText("Share Vitals Trends")).toBeNull();
    expect(code()).not.toMatch(/\[Shared: /);
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

  it("surfaces a picker FAILURE instead of silently doing nothing", async () => {
    picker().getDocumentAsync.mockRejectedValueOnce(new Error("provider went away"));
    render(<ChatThreadScreen />);

    await pressAsync("Attach file");

    expect(screen.getByTestId("composer-media-notice")).toBeTruthy();
    expect(screen.getByText(/could not be opened/)).toBeTruthy();

    // …and the notice is clearable, so it can't outlive its cause.
    await pressAsync("Dismiss message");
    expect(screen.queryByTestId("composer-media-notice")).toBeNull();
  });

  it("removing the attachment is possible, and does not delete a picked FILE", async () => {
    picker().getDocumentAsync.mockResolvedValueOnce(PICKED_PDF);
    render(<ChatThreadScreen />);

    await pressAsync("Attach file");
    await pressAsync("Remove attachment Referral.pdf");

    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
    // Only captures we created are reaped; a re-pick can hand back the same uri.
    expect(fs().__deleted).toHaveLength(0);
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
    // The recording state moved INSIDE the composer pill with the voice-note
    // pass (Figma `voice_note — 2..5`), so the id is the pill's, not the tray's.
    // ComposerMediaTray still draws it for AiAssistantScreen, whose suite still
    // asserts `composer-recording-bar`.
    expect(screen.getByTestId("voice-recording-bar")).toBeTruthy();

    await pressAsync("Stop recording");
    expect(a.__recorder.stop).toHaveBeenCalled();
    // Session handed back, so the OS mic indicator clears.
    expect(a.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
    // …and lands in REVIEW rather than in a named chip: a capture is now
    // listened back to before it is sent.
    expect(screen.getByTestId("voice-review-bar")).toBeTruthy();
    expect(screen.getByLabelText("Play voice note")).toBeTruthy();
  });

  it("discards a recording without attaching it, and reaps the file", async () => {
    render(<ChatThreadScreen />);

    await pressAsync("Voice message");
    await pressAsync("Discard recording");

    expect(audio().__recorder.stop).toHaveBeenCalled();
    expect(screen.queryByTestId("voice-recording-bar")).toBeNull();
    expect(screen.queryByTestId("voice-review-bar")).toBeNull();
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

  it("says SETTINGS when the OS will not prompt again (canAskAgain: false)", async () => {
    setMicPermission({ granted: false, status: "denied", canAskAgain: false });
    render(<ChatThreadScreen />);

    await pressAsync("Voice message");

    // Pointless to ask — and asking would be a tap that visibly does nothing.
    expect(audio().requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/Settings/)).toBeTruthy();
  });

  it("reports a capture that produced no file rather than attaching nothing", async () => {
    const a = audio();
    a.__recorder.stop.mockImplementationOnce(async () => {
      a.__recorder.isRecording = false;
      a.__recorder.uri = null;
    });
    render(<ChatThreadScreen />);

    await pressAsync("Voice message");
    await pressAsync("Stop recording");

    expect(screen.queryByTestId("composer-attachment-chip")).toBeNull();
    expect(screen.queryByTestId("voice-review-bar")).toBeNull();
    expect(screen.getByText(/could not be saved/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// BRAND compliance — carried over from AiAssistantScreen's suite, which used to
// be the only place these were asserted and no longer renders a composer.
// ---------------------------------------------------------------------------

describe("ChatThreadScreen — BRAND compliance", () => {
  it("imports no icon library — the icon gate is the only file allowed to", () => {
    const src = code();
    expect(src).not.toMatch(/@expo\/vector-icons/);
    expect(src).not.toMatch(/MaterialIcons/);
  });

  it("carries no raw colour literals, including white", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\(/);
    expect(src).not.toMatch(/\btext-white\b/);
  });
});

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

import { ChatThreadScreen } from "../ChatThreadScreen";

const SOURCE_PATH = join(__dirname, "..", "ChatThreadScreen.tsx");

/** The migration notes name the very literals these tests ban; prose must not fail them. */
function code(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

beforeEach(() => {
  mockBack.mockClear();
  mockScheme.value = "light";
});

describe("ChatThreadScreen — renders through DetailShell", () => {
  it("keeps the bar's title, subtitle, avatar, presence dot and both actions", () => {
    render(<ChatThreadScreen />);

    expect(screen.getByText("Dr. Sarah Miller")).toBeTruthy();
    expect(screen.getByText("Doctor · Cardiologist")).toBeTruthy();
    expect(screen.getByLabelText("Dr. Sarah Miller")).toBeTruthy(); // avatar
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
